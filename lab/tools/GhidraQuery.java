// Headless Ghidra query, run inside sky-re by lab/tools/ghidra-query.sh:
//   decompile <address>   C of the function containing <address>
//   xrefs <address>       references to <address>, with the referencing function
//   bytes <address> [n]   raw bytes
// Addresses: image addresses (0x1409e3580) or RVAs with a leading '+' (+0x9e3580).
// Output between BEGIN and END lines; the wrapper cuts it out of Ghidra's log.
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.util.task.ConsoleTaskMonitor;

public class GhidraQuery extends GhidraScript {
    private Address addr(String text) {
        text = text.trim();
        if (text.startsWith("+")) {
            return currentProgram.getImageBase().add(Long.parseLong(text.substring(3), 16));
        }
        return currentProgram.getAddressFactory().getAddress(text);
    }

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        println("BEGIN");
        String cmd = args.length > 0 ? args[0] : "help";
        if (cmd.equals("decompile")) {
            Address a = addr(args[1]);
            Function f = currentProgram.getFunctionManager().getFunctionContaining(a);
            if (f == null) { println("no function contains " + a); }
            else {
                DecompInterface di = new DecompInterface();
                di.openProgram(currentProgram);
                DecompileResults res = di.decompileFunction(f, 120, new ConsoleTaskMonitor());
                println("function " + f.getName() + " at " + f.getEntryPoint() + " size " + f.getBody().getNumAddresses());
                String c = res.decompileCompleted() ? res.getDecompiledFunction().getC() : "decompile failed: " + res.getErrorMessage();
                for (String line : c.split("\\r?\\n")) println(line);  // one log line each, so the wrapper keeps them all
            }
        } else if (cmd.equals("xrefs")) {
            Address a = addr(args[1]);
            int n = 0;
            for (Reference r : currentProgram.getReferenceManager().getReferencesTo(a)) {
                Function f = currentProgram.getFunctionManager().getFunctionContaining(r.getFromAddress());
                println(r.getFromAddress() + " " + r.getReferenceType() + " " + (f != null ? f.getName() + " @ " + f.getEntryPoint() : "(no function)"));
                n++;
            }
            println("xrefs: " + n);
        } else if (cmd.equals("bytes")) {
            Address a = addr(args[1]);
            int n = args.length > 2 ? Integer.parseInt(args[2]) : 32;
            StringBuilder sb = new StringBuilder();
            for (byte b : getBytes(a, n)) sb.append(String.format("%02x ", b & 0xff));
            println(sb.toString().trim());
        } else {
            println("usage: decompile <addr> | xrefs <addr> | bytes <addr> [n]");
        }
        println("END");
    }
}
