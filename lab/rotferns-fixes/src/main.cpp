// Rotfern's Fixes: the terrain-overlay null check (docs/research/terrain-upgrade-crash.md).
//
// The engine's terrain update job, when a queued terrain task completes, sweeps every loaded cell's
// land (Address Library 13414 -> 18789 on 1.6.1170) and writes the LOD block's diffuse and the noise
// texture into each land quad's landscape material. It reaches the quad's geometry as
// loadedData->mesh[quad]->children[0]->AsGeometry() and dereferences children[0] without a null
// check, on the empty-array path and on a null first child alike; a land whose quad geometry is not
// attached yet (the initial load, a job thread) crashes at SkyrimSE.exe+02AD242. The detour below
// replaces the compare at 18789+0x14A with the same read plus the null checks, continuing at
// +0x162 with rax = children._data and rcx = the child exactly as the original fall-through did, or
// skipping to the next quad at +0x340.
//
// Rule 2 (docs/LAB.md): the site is a decompiler read until the run proves it. The runtime and the
// ten bytes are checked before anything is written; the three log lines below are the contract a
// scenario may count.
#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>

#include <spdlog/sinks/basic_file_sink.h>
#include <xbyak/xbyak.h>

#include <array>
#include <cstdint>
#include <cstring>
#include <string>

namespace
{
	using namespace std::literals;

	// the per-land sweep function (1.6.1170 id; the detour, the resume and the skip are offsets into it)
	constexpr REL::ID        kSweep(18789);
	constexpr std::ptrdiff_t kSite = 0x14A;    // cmp word ptr [rax+0x122], 0 ; ja +4   (10 bytes)
	constexpr std::ptrdiff_t kResume = 0x162;  // mov rax, [rcx] ; call [rax+0x38]        (rax = children.data, rcx = child)
	constexpr std::ptrdiff_t kSkip = 0x340;    // inc esi                                  (the next quad)

	// the bytes the detour replaces, read from the unpacked 1.6.1170 image (the spec page)
	constexpr std::array<std::uint8_t, 10> kExpected{ 0x66, 0x83, 0xB8, 0x22, 0x01, 0x00, 0x00, 0x00, 0x77, 0x04 };
	constexpr REL::Version                 kRuntime{ 1, 6, 1170, 0 };

	// NiNode::children (NiTObjectArray at +0x110): _data at +0x118, _freeIdx (uint16) at +0x122, _size at +0x124
	// (CommonLibSSE-NG NiNode.h, NiTArray.h:118-119); the engine's own test reads _freeIdx, so the detour does too
	struct Detour : Xbyak::CodeGenerator
	{
		Detour(std::uintptr_t a_resume, std::uintptr_t a_skip)
		{
			Xbyak::Label skip;
			movzx(ecx, word[rax + 0x122]);  // mesh->children._freeIdx, the engine's own test
			test(ecx, ecx);
			jz(skip);
			mov(rax, ptr[rax + 0x118]);  // children._data
			test(rax, rax);              // the review's hardening (thuum-cf, 2026-11-06): a null array
			jz(skip);
			mov(rcx, ptr[rax]);          // children[0]
			test(rcx, rcx);
			jz(skip);
			mov(r11, a_resume);  // r11 is untouched by the function (read 2026-11-06), so an absolute exit needs no reach
			jmp(r11);
			L(skip);
			mov(r11, a_skip);
			jmp(r11);
		}
	};

	std::string Hex(const std::array<std::uint8_t, 10>& a_bytes)
	{
		std::string s;
		for (auto b : a_bytes) {
			s += fmt::format("{:02X} ", b);
		}
		return s;
	}

	void InitLog()
	{
		auto path = SKSE::log::log_directory();
		if (!path) {
			return;
		}
		*path /= "rotferns-fixes.log"sv;
		auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(path->string(), true);
		auto log = std::make_shared<spdlog::logger>("global", std::move(sink));
		log->set_level(spdlog::level::info);
		log->flush_on(spdlog::level::info);
		spdlog::set_default_logger(std::move(log));
		spdlog::set_pattern("[%H:%M:%S.%e] [%l] %v"s);
	}

	// the three outcomes, one line each; the words "installed", "wrong runtime" and "bytes mismatch" are the contract
	bool InstallTerrainOverlayNullCheck()
	{
		const auto runtime = REL::Module::get().version();
		if (runtime != kRuntime) {
			SKSE::log::warn("terrain-overlay null check: wrong runtime {} (built for {}); not installed", runtime.string(), kRuntime.string());
			return false;
		}
		const auto base = kSweep.address();
		const auto site = base + kSite;
		std::array<std::uint8_t, 10> found{};
		std::memcpy(found.data(), reinterpret_cast<const void*>(site), found.size());
		if (found != kExpected) {
			SKSE::log::warn("terrain-overlay null check: bytes mismatch at SkyrimSE.exe+{:X}: found {}; not installed", site - REL::Module::get().base(), Hex(found));
			return false;
		}

		auto& trampoline = SKSE::GetTrampoline();
		Detour detour(base + kResume, base + kSkip);
		detour.ready();
		const auto code = trampoline.allocate(detour);
		trampoline.write_branch<5>(site, reinterpret_cast<std::uintptr_t>(code));
		constexpr std::array<std::uint8_t, 5> nops{ 0x90, 0x90, 0x90, 0x90, 0x90 };
		REL::safe_write(site + 5, std::span<const std::uint8_t>(nops));
		SKSE::log::info("terrain-overlay null check installed at SkyrimSE.exe+{:X} (id 18789+0x{:X}), runtime {}", site - REL::Module::get().base(), kSite, runtime.string());
		return true;
	}
}

SKSEPluginLoad(const SKSE::LoadInterface* a_skse)
{
	SKSE::Init(a_skse);
	InitLog();
	SKSE::log::info("Rotfern's Fixes {} loading", REL::Version{ 0, 1, 0, 0 }.string());
	// the detour assembles to about 57 bytes and write_branch<5> takes a 14-byte stub from the same
	// trampoline (CommonLib Trampoline.cpp:141-161); 64 failed the allocation at every launch (the review)
	SKSE::AllocTrampoline(128);
	InstallTerrainOverlayNullCheck();
	return true;
}
