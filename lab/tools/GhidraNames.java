// Headless Ghidra post-script, run inside sky-re by lab/tools/ghidra-names.sh (without -readOnly, so
// the names are saved): CommonLibSSE-NG's names into one program of SkyrimSE.exe.
//   GhidraNames.java <seed file> [<vtable slot file>]
// seed file, rea-ghidra-seeds-v1 (lab/tools/rea-seeds.py): 0x<address>\t<kind>[\t<name>]
//   function: create the function if absent, name it; code: disassemble, label it if named; label.
//   Aliases joined with __or__ name the function after the first and label the address with the rest.
// slot file, thuum-vtable-slots-v1 (lab/tools/vtable-slots.py): 0x<vtable>\t0x<slot>\t<Class::method>[\t<where>]
//   a vtable is used only if its RTTI says it is the class's primary one, and a slot only if it lies
//   before the vtable's end; the function the pointer at vtable + slot * 8 targets is created if
//   absent and named after the first row that reaches it; a target already named, or reached by
//   more than one Class::method, gets a repeatable comment listing every slot it fills.
// Names go in as SourceType.IMPORTED, split on "::" into Ghidra namespaces (a vtable's class becomes
// a Ghidra class). Only DEFAULT names (FUN_..., thunk_FUN_...) are replaced; user, analysis and
// imported names stay. Each file's header must name the program's runtime and image base.
// The run is one transaction: an exception (a header mismatch included) aborts it whole, so a
// partial run saves nothing.
// Output between BEGIN and END lines; the wrapper cuts it out of Ghidra's log.
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.app.script.GhidraScript;
import ghidra.app.util.NamespaceUtils;
import ghidra.app.util.SymbolPath;
import ghidra.app.util.bin.format.pe.ResourceDataDirectory;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.*;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.*;

public class GhidraNames extends GhidraScript {
	private static final String COMMENT_PREFIX = "CommonLib vtable slots: ";
	private static final String ANON = "`anonymous_namespace'";
	private static final Pattern HEADER = Pattern.compile("SkyrimSE (\\S+) at base (0x[0-9a-fA-F]+)");

	private final Map<String, Integer> counts = new TreeMap<>();
	private final Map<String, List<String>> examples = new TreeMap<>();
	private final Map<String, Namespace> namespaces = new HashMap<>();
	private SymbolTable st;
	private FunctionManager fm;
	private Listing listing;
	private Memory mem;
	private Address imageBase;

	private record Claim(String name, int slot) {}

	private void count(String key, String example) {
		counts.merge(key, 1, Integer::sum);
		if (example != null) {
			List<String> ex = examples.computeIfAbsent(key, k -> new ArrayList<>());
			if (ex.size() < 5) ex.add(example);
		}
	}

	private List<String[]> rows(String file, String format) throws Exception {
		List<String> lines = Files.readAllLines(Path.of(file), StandardCharsets.UTF_8);
		check(file, format, lines.isEmpty() ? "" : lines.get(0));
		List<String[]> out = new ArrayList<>();
		for (String line : lines) {
			if (!line.startsWith("#") && !line.isBlank()) out.add(line.split("\t"));
		}
		return out;
	}

	// The first line names the runtime and the base its addresses assume; refuse a program that is not them.
	private void check(String file, String format, String header) throws Exception {
		if (!header.startsWith("# " + format)) throw new IllegalArgumentException(file + " is not " + format + ": " + header);
		Matcher m = HEADER.matcher(header);
		if (!m.find()) throw new IllegalArgumentException(file + " names no runtime and base: " + header);
		long base = Long.decode(m.group(2));
		if (base != imageBase.getOffset()) {
			throw new IllegalArgumentException(file + " is at base 0x" + Long.toHexString(base) + ", the program at " + imageBase);
		}
		String version = currentProgram.getOptions(Program.PROGRAM_INFO)
				.getString(ResourceDataDirectory.getPeResourceProperty("FileVersion"), "");
		if (!(version + ".").startsWith(m.group(1) + ".")) {
			throw new IllegalArgumentException(file + " is for SkyrimSE " + m.group(1) + ", the program is " + version);
		}
	}

	private boolean isCode(Address a) {
		MemoryBlock b = a == null ? null : mem.getBlock(a);
		return b != null && b.isExecute() && b.isInitialized();
	}

	private Address pointerAt(Address a) {
		try {
			return toAddr(getLong(a));
		}
		catch (Exception e) {
			return null;
		}
	}

	private static boolean isDefault(Function f) {
		return f.getSymbol().getSource() == SourceType.DEFAULT;
	}

	private Namespace namespace(SymbolPath parent, boolean asClass) throws Exception {
		if (parent == null) return currentProgram.getGlobalNamespace();
		String path = parent.getPath();
		Namespace ns = namespaces.get(path);
		if (ns == null) {
			ns = NamespaceUtils.createNamespaceHierarchy(path, null, currentProgram, SourceType.IMPORTED);
			namespaces.put(path, ns);
		}
		if (asClass && !(ns instanceof GhidraClass)) {
			ns = NamespaceUtils.convertNamespaceToClass(ns);
			namespaces.put(path, ns);
			count("classes made from vtables", null);
		}
		return ns;
	}

	private void name(Function f, String path, boolean asClass) throws Exception {
		SymbolPath sp = new SymbolPath(path);
		f.getSymbol().setNameAndNamespace(sp.getName(), namespace(sp.getParent(), asClass), SourceType.IMPORTED);
	}

	private boolean label(Address a, String path) throws Exception {
		SymbolPath sp = new SymbolPath(path);
		Namespace ns = namespace(sp.getParent(), false);
		if (st.getSymbol(sp.getName(), a, ns) != null) {
			count("labels already there", null);
			return false;
		}
		st.createLabel(a, sp.getName(), ns, SourceType.IMPORTED);
		count("labels made", null);
		return true;
	}

	// A function at a, disassembling first if the bytes are undefined; null if a holds data or fails.
	private Function makeFunction(Address a) {
		if (listing.getInstructionAt(a) == null) {
			if (listing.getDefinedDataContaining(a) != null) return null;
			disassemble(a);
			if (listing.getInstructionAt(a) == null) return null;
		}
		CreateFunctionCmd cmd = new CreateFunctionCmd(null, a, null, SourceType.DEFAULT);
		return cmd.applyTo(currentProgram, monitor) ? fm.getFunctionAt(a) : null;
	}

	private String fullName(Function f) {
		return f.getSymbol().getName(true);
	}

	private void seedFunction(Address a, String[] aliases) throws Exception {
		if (!isCode(a)) {
			// relid.py's offset kind (Offsets.h) does not say function or global: outside code it is a global
			for (String alias : aliases) label(a, alias);
			count("function rows outside code, labeled", a + " " + aliases[0]);
			return;
		}
		Function f = fm.getFunctionAt(a);
		if (f == null) {
			Function around = fm.getFunctionContaining(a);
			f = makeFunction(a);
			if (f == null) {
				count("errors", a + " " + aliases[0] + ": no function could be made");
				for (String alias : aliases) label(a, alias);
				return;
			}
			name(f, aliases[0], false);
			count("functions named (made)", around == null ? null
					: a + " " + aliases[0] + " split from " + fullName(around) + " @ " + around.getEntryPoint());
			if (around != null) count("functions made inside another (split)", a + " " + aliases[0] + " from " + around.getEntryPoint());
		}
		else if (isDefault(f)) {
			name(f, aliases[0], false);
			count("functions renamed", null);
		}
		else if (!fullName(f).equals(new SymbolPath(aliases[0]).getPath())) {
			count("functions skipped (already named)", a + " keeps " + fullName(f) + " (" + f.getSymbol().getSource() + "), CommonLib: " + aliases[0]);
		}
		else {
			count("functions already carrying the name", null);
		}
		for (int i = 1; i < aliases.length; i++) {
			if (label(a, aliases[i])) count("alias labels", null);
		}
	}

	private void applySeeds(String file) throws Exception {
		List<String[]> rows = rows(file, "rea-ghidra-seeds-v1");
		// functions first, so a label row at a function's address never becomes the function's name
		for (String kind : List.of("function", "code", "label")) {
			for (String[] r : rows) {
				if (!r[1].equals(kind)) continue;
				monitor.checkCancelled();
				Address a = toAddr(Long.decode(r[0]));
				String[] aliases = r.length > 2 ? r[2].split("__or__") : new String[0];
				try {
					switch (kind) {
						case "function" -> seedFunction(a, aliases);
						case "code" -> {
							if (isCode(a) && listing.getInstructionAt(a) == null && listing.getDefinedDataContaining(a) == null) disassemble(a);
							for (String alias : aliases) label(a, alias);
						}
						default -> {
							for (String alias : aliases) label(a, alias);
						}
					}
				}
				catch (Exception e) {
					count("errors", r[0] + " " + String.join("|", aliases) + ": " + e);
				}
			}
		}
	}

	// The decorated RTTI name a class path should have, .?AV (class) or .?AU (struct), innermost name
	// first; an `anonymous_namespace' component (vtable-slots.py's spelling) stands for ?A0x<hash>.
	private static Pattern mangled(String cls) {
		List<String> parts = new ArrayList<>(new SymbolPath(cls).asList());
		Collections.reverse(parts);
		StringBuilder re = new StringBuilder("\\.\\?A[VU]");
		for (String p : parts) re.append(p.equals(ANON) ? "\\?A0x[0-9a-f]+" : Pattern.quote(p)).append('@');
		return Pattern.compile(re.append('@').toString());
	}

	// Null if vt is the primary vtable of cls, else why not. The structures are CommonLib's
	// RE/RTTI.h: CompleteObjectLocator (:108) signature 1 for x64 at 00, the subobject offset at 04,
	// the TypeDescriptor's RVA at 0C; type_info (:9) holds the mangled name at 10. The locator's
	// pointer is the qword before the vtable (MSVC's layout): a vtable failing any of this is
	// skipped, so a wrong premise costs names, it never misplaces them.
	private String vtableProblem(Address vt, String cls) {
		try {
			Address col = pointerAt(vt.subtract(8));
			if (col == null || !mem.contains(col)) return "no RTTI locator before it";
			int sig = getInt(col), off = getInt(col.add(4));
			long td = getInt(col.add(12)) & 0xffffffffL;
			if (sig != 1) return "locator signature " + sig;
			if (off != 0) return "locator offset 0x" + Integer.toHexString(off) + ", not a primary vtable";
			StringBuilder sb = new StringBuilder();
			Address p = imageBase.add(td + 0x10);
			for (int i = 0; i < 1024; i++) {
				byte b = getByte(p.add(i));
				if (b == 0) break;
				sb.append((char) (b & 0xff));
			}
			if (!mangled(cls).matcher(sb).matches()) return "RTTI names " + sb;
			return null;
		}
		catch (Exception e) {
			return "unreadable: " + e.getMessage();
		}
	}

	// Entries from vt that point into executable memory; the next vtable's locator pointer ends the run.
	private int vtableLength(Address vt) {
		int n = 0;
		while (n < 0x800 && isCode(pointerAt(vt.add(8L * n)))) n++;
		return n;
	}

	private void applySlots(String file) throws Exception {
		Map<Address, List<Claim>> targets = new LinkedHashMap<>();
		Map<Address, String> problems = new HashMap<>();
		Map<Address, Integer> lengths = new HashMap<>();
		for (String[] r : rows(file, "thuum-vtable-slots-v1")) {
			Address vt = toAddr(Long.decode(r[0]));
			int slot = Integer.decode(r[1]);
			String name = r[2];
			String cls = new SymbolPath(name).getParentPath();
			if (cls == null) {
				count("errors", r[0] + " " + name + ": a slot row names no class");
				continue;
			}
			if (!problems.containsKey(vt)) {
				String problem = vtableProblem(vt, cls);
				problems.put(vt, problem);
				lengths.put(vt, vtableLength(vt));
				if (problem != null) count("vtables skipped", vt + " " + cls + ": " + problem);
				else count("vtables checked", null);
			}
			if (problems.get(vt) != null) {
				count("slot rows skipped (vtable failed its RTTI check)", null);
				continue;
			}
			if (slot >= lengths.get(vt)) {
				count("slot rows skipped (past the vtable's end)", name + " slot 0x" + Integer.toHexString(slot) + " of " + lengths.get(vt));
				continue;
			}
			Address t = pointerAt(vt.add(8L * slot));
			targets.computeIfAbsent(t, k -> new ArrayList<>()).add(new Claim(name, slot));
			count("slot rows read", null);
		}
		for (Map.Entry<Address, List<Claim>> e : targets.entrySet()) {
			monitor.checkCancelled();
			Address t = e.getKey();
			List<Claim> claims = e.getValue();
			Set<String> distinct = new LinkedHashSet<>();
			for (Claim c : claims) distinct.add(c.name());
			try {
				Function f = fm.getFunctionAt(t);
				if (f == null) {
					Function around = fm.getFunctionContaining(t);
					f = makeFunction(t);
					if (f == null) {
						count("errors", t + " " + claims.get(0).name() + ": slot target, no function could be made");
						continue;
					}
					count("slot targets made", around == null ? null : t + " split from " + fullName(around) + " @ " + around.getEntryPoint());
					if (around != null) count("functions made inside another (split)", t + " " + claims.get(0).name() + " from " + around.getEntryPoint());
				}
				boolean wasDefault = isDefault(f);
				if (wasDefault) {
					name(f, claims.get(0).name(), true);
					count("slot targets named", null);
				}
				else {
					// the class is still a vtable's: make its namespace a class even when the name stays
					namespace(new SymbolPath(claims.get(0).name()).getParent(), true);
				}
				if (!wasDefault && distinct.size() == 1 && fullName(f).equals(claims.get(0).name())) {
					count("slot targets already carrying the name", null);
					continue;
				}
				if (!wasDefault || distinct.size() > 1) {
					StringBuilder sb = new StringBuilder(COMMENT_PREFIX);
					for (int i = 0; i < claims.size(); i++) {
						if (i > 0) sb.append(", ");
						sb.append(claims.get(i).name()).append(" (").append(String.format("%02X", claims.get(i).slot())).append(")");
					}
					String old = getRepeatableComment(t);
					StringBuilder merged = new StringBuilder();
					if (old != null) {
						for (String line : old.split("\n")) {
							if (!line.startsWith(COMMENT_PREFIX)) merged.append(line).append("\n");
						}
					}
					merged.append(sb);
					setRepeatableComment(t, merged.toString());
					count("slot targets commented", wasDefault ? null : t + " keeps " + fullName(f) + " (" + f.getSymbol().getSource() + ")");
					if (distinct.size() > 1) count("slot targets reached by several methods", null);
				}
			}
			catch (Exception ex) {
				count("errors", t + " " + claims.get(0).name() + ": " + ex);
			}
		}
	}

	private String census() {
		int total = 0, named = 0, imported = 0, user = 0;
		for (Function f : fm.getFunctions(true)) {
			total++;
			SourceType s = f.getSymbol().getSource();
			if (s != SourceType.DEFAULT) named++;
			if (s == SourceType.IMPORTED) imported++;
			if (s == SourceType.USER_DEFINED) user++;
		}
		return "functions " + total + ", named " + named + " (imported " + imported + ", user " + user + "), default " + (total - named);
	}

	@Override
	public void run() throws Exception {
		String[] args = getScriptArgs();
		println("BEGIN");
		if (args.length < 1) {
			println("usage: GhidraNames.java <seed file> [<vtable slot file>]");
			println("END");
			return;
		}
		st = currentProgram.getSymbolTable();
		fm = currentProgram.getFunctionManager();
		listing = currentProgram.getListing();
		mem = currentProgram.getMemory();
		imageBase = currentProgram.getImageBase();
		println("program " + currentProgram.getName() + " base " + imageBase);
		println("before: " + census());
		boolean commit = false;
		int tx = currentProgram.startTransaction("thuum GhidraNames: CommonLibSSE-NG names");
		try {
			applySeeds(args[0]);
			if (args.length > 1) applySlots(args[1]);
			commit = true;
		}
		finally {
			currentProgram.endTransaction(tx, commit);  // an abort here aborts the script's whole transaction
			if (!commit) {
				end(false);
				println("ABORTED: nothing was changed");
			}
		}
		println("after: " + census());
		for (Map.Entry<String, Integer> c : counts.entrySet()) {
			println(c.getKey() + ": " + c.getValue());
			for (String ex : examples.getOrDefault(c.getKey(), List.of())) println("  e.g. " + ex);
		}
		println("END");
	}
}
