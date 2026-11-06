#!/usr/bin/env python3
"""disasm-chain.py <unpacked SkyrimSE.exe> <versionlib-*.bin> SPEC...

Annotated disassembly of a crash chain from the Steamless-unpacked image (the
on-disk Steam exe is stub-packed: .text is noise until unpacked). Direct call
targets and rip-relative operands are labelled with Address Library ids from
the versionlib database (parsed as CommonLibSSE-NG's REL::IDDatabase does).

SPEC  +START..+END            whole range (RVAs)
      +START..+END@MARK       mark one RVA with >>
      +START..+END@MARK~N     only N instructions before and N/2 after MARK
      vtable:+RVA             dump a vtable: RTTI name and slots that point into .text
Needs: pip install capstone pefile (a scratch venv is fine).
"""
import sys, bisect, struct, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_64
from capstone.x86 import X86_OP_IMM, X86_OP_MEM, X86_REG_RIP

def load_versionlib(path):
    d = open(path, 'rb').read(); p = 0
    def rd(fmt):
        nonlocal p; v = struct.unpack_from(fmt, d, p); p += struct.calcsize(fmt); return v[0]
    rd('<i'); [rd('<i') for _ in range(4)]; name_len = rd('<i'); p += name_len; ptr = rd('<i'); n = rd('<i')  # read the length first: `p += rd()` reads p before rd advances it
    pvid = poff = 0; byoff = {}
    for _ in range(n):
        t = rd('<B'); lo, hi = t & 0xF, t >> 4
        vid = [lambda: rd('<Q'), lambda: pvid + 1, lambda: pvid + rd('<B'), lambda: pvid - rd('<B'),
               lambda: pvid + rd('<H'), lambda: pvid - rd('<H'), lambda: rd('<H'), lambda: rd('<I')][lo]()
        tmp = (poff // ptr) if (hi & 8) else poff
        off = [lambda: rd('<Q'), lambda: tmp + 1, lambda: tmp + rd('<B'), lambda: tmp - rd('<B'),
               lambda: tmp + rd('<H'), lambda: tmp - rd('<H'), lambda: rd('<H'), lambda: rd('<I')][hi & 7]()
        if hi & 8: off *= ptr
        byoff[off] = vid; pvid, poff = vid, off
    return byoff

def main():
    exe, vl, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
    pe = pefile.PE(exe, fast_load=True); base = pe.OPTIONAL_HEADER.ImageBase
    byoff = load_versionlib(vl); offs = sorted(byoff)
    def idstr(rva):
        i = bisect.bisect_right(offs, rva) - 1
        if i < 0: return 'id ?'
        d = rva - offs[i]; return 'id %d%s' % (byoff[offs[i]], ('+0x%X' % d) if d else '')
    def sect(rva):
        for s in pe.sections:
            if s.VirtualAddress <= rva < s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData): return s.Name.rstrip(b'\0').decode()
        return '?'
    def text(rva):
        try: b = pe.get_data(rva, 96)
        except Exception: return None
        s = b.split(b'\0')[0]
        if len(s) >= 4 and all(32 <= c < 127 for c in s): return s.decode()
        u = b.decode('utf-16-le', 'ignore').split('\0')[0]
        return ('L' + u) if len(u) >= 4 and all(32 <= ord(c) < 127 for c in u) else None
    md = Cs(CS_ARCH_X86, CS_MODE_64); md.detail = True
    print("image base 0x%X; sections %s" % (base, ' '.join('%s@+%X' % (s.Name.rstrip(b'\0').decode(), s.VirtualAddress) for s in pe.sections)))
    for spec in specs:
        if spec.startswith('vtable:'):
            rva = int(spec[7:], 16); print("\n==== vtable +%07X (%s)" % (rva, idstr(rva)))
            try:
                col = struct.unpack_from('<Q', pe.get_data(rva - 8, 8))[0] - base
                td = struct.unpack_from('<I', pe.get_data(col + 12, 4))[0]
                print("   RTTI:", pe.get_data(td + 16, 96).split(b'\0')[0].decode())
            except Exception as e: print("   (no RTTI: %s)" % e)
            for i in range(64):
                p = struct.unpack_from('<Q', pe.get_data(rva + 8 * i, 8))[0] - base
                if sect(p) != '.text': break
                print("   slot %2d -> +%07X  %s" % (i, p, idstr(p)))
            continue
        rng, _, rest = spec.partition('@'); start, end = (int(x, 16) for x in rng.split('..'))
        mark = win = None
        if rest:
            m, _, w = rest.partition('~'); mark = int(m, 16); win = int(w) if w else None
        insns = list(md.disasm(pe.get_data(start, end - start), base + start))
        if win and mark is not None:
            i = next((k for k, x in enumerate(insns) if x.address - base == mark), None)
            if i is not None: insns = insns[max(0, i - win):i + win // 2]
        print("\n==== +%07X..+%07X  (%s)" % (start, end, idstr(start)))
        for insn in insns:
            rva = insn.address - base; notes = []
            if insn.mnemonic in ('call', 'jmp') and insn.operands and insn.operands[0].type == X86_OP_IMM:
                notes.append('-> %s' % idstr(insn.operands[0].imm - base))
            for op in insn.operands:
                if op.type == X86_OP_MEM and op.mem.base == X86_REG_RIP:
                    t = insn.address + insn.size + op.mem.disp - base; s = text(t)
                    notes.append('[rip]-> +%07X %s %s%s' % (t, sect(t), idstr(t), (' "%s"' % s) if s else ''))
            print("%s +%07X  %-8s %s%s" % ('>>' if rva == mark else '  ', rva, insn.mnemonic, insn.op_str, ('   ; ' + '  '.join(notes)) if notes else ''))

if __name__ == '__main__':
    main()
