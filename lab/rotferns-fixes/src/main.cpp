// Rotfern's Fixes: the terrain-overlay null check (docs/research/terrain-upgrade-crash.md, ADR-069).
//
// The engine's terrain update job, when a queued terrain task completes, sweeps every loaded cell's
// land and writes the LOD block's diffuse and the noise texture into each land quad's landscape
// material: Address Library 18789 on 1.6.1170, called from three such sweeps (13414, 13317, 15960).
// It reaches the quad's geometry as loadedData->mesh[quad]->children[0]->AsGeometry() and
// dereferences children[0] without a null check, on the empty-array path and on a null first child
// alike; a land whose quad geometry is not attached yet (the initial load, a job thread) crashes at
// SkyrimSE.exe+02AD242. The detour below replaces the compare at 18789+0x14A with the same read plus
// the null checks, continuing at +0x162 with rax = children._data and rcx = the child exactly as the
// original fall-through did, or skipping to the next quad at +0x340, counting each skip.
//
// Rule 2 (docs/LAB.md): the site is a decompiler read until the run proves it. The runtime and the
// bytes at the site and at both jump-back targets are checked before anything is written; the log
// lines below (installed, wrong runtime, bytes mismatch, skipped) are the contract a scenario may count.
#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>

#include <spdlog/sinks/basic_file_sink.h>
#include <xbyak/xbyak.h>

#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <span>
#include <string>
#include <thread>

namespace
{
	using namespace std::literals;

	// the per-land sweep function (1.6.1170 id; the detour, the resume and the skip are offsets into it)
	constexpr REL::ID        kSweep(18789);
	constexpr std::ptrdiff_t kSite = 0x14A;    // cmp word ptr [rax+0x122], 0 ; ja +4   (10 bytes)
	constexpr std::ptrdiff_t kResume = 0x162;  // mov rax, [rcx] ; call [rax+0x38]        (rax = children._data, rcx = child)
	constexpr std::ptrdiff_t kSkip = 0x340;    // inc esi ; add r14, 8                     (the next quad)

	// the bytes at each, read from the unpacked 1.6.1170 image (the spec page)
	constexpr std::array<std::uint8_t, 10> kSiteBytes{ 0x66, 0x83, 0xB8, 0x22, 0x01, 0x00, 0x00, 0x00, 0x77, 0x04 };
	constexpr std::array<std::uint8_t, 6>  kResumeBytes{ 0x48, 0x8B, 0x01, 0xFF, 0x50, 0x38 };
	constexpr std::array<std::uint8_t, 6>  kSkipBytes{ 0xFF, 0xC6, 0x49, 0x83, 0xC6, 0x08 };
	constexpr REL::Version                 kRuntime{ 1, 6, 1170, 0 };

	// quads skipped since launch; the detour increments it, a logger thread reports it
	std::atomic<std::uint32_t> g_skips{ 0 };
	// the detour's `lock inc dword [r11]` on it must be the atomic's whole representation (thuum-cf's re-analyst, 2026-11-06)
	static_assert(sizeof(g_skips) == 4 && alignof(decltype(g_skips)) == 4 && decltype(g_skips)::is_always_lock_free);

	// NiNode::children (NiTObjectArray at +0x110): _data at +0x118, _freeIdx (uint16) at +0x122, _size at +0x124
	// (CommonLibSSE-NG NiNode.h, NiTArray.h:118-119); the engine's own test reads _freeIdx, so the detour does too
	struct Detour : Xbyak::CodeGenerator
	{
		Detour(std::uintptr_t a_resume, std::uintptr_t a_skip, std::uintptr_t a_counter)
		{
			Xbyak::Label skip;
			movzx(ecx, word[rax + 0x122]);  // mesh->children._freeIdx, the engine's own test
			test(ecx, ecx);
			jz(skip);
			mov(rax, ptr[rax + 0x118]);  // children._data
			test(rax, rax);              // the review's hardening (thuum-cf, 2026-11-06): a null array
			jz(skip);
			mov(rcx, ptr[rax]);  // children[0]
			test(rcx, rcx);
			jz(skip);
			// r11 is dead at both exits: the call at +0x165 clobbers it, and the function writes it
			// (lea r11 at +0x357) before reading it; the flags die at both exits too (the reviews)
			mov(r11, a_resume);
			jmp(r11);
			L(skip);
			mov(r11, a_counter);
			lock();
			inc(dword[r11]);
			mov(r11, a_skip);
			jmp(r11);
		}
	};

	template <std::size_t N>
	std::string Hex(const std::array<std::uint8_t, N>& a_bytes)
	{
		std::string s;
		for (auto b : a_bytes) {
			s += fmt::format("{:02X} ", b);
		}
		return s;
	}

	template <std::size_t N>
	bool Matches(std::uintptr_t a_at, const std::array<std::uint8_t, N>& a_expected, std::string_view a_what)
	{
		std::array<std::uint8_t, N> found{};
		std::memcpy(found.data(), reinterpret_cast<const void*>(a_at), N);
		if (found != a_expected) {
			SKSE::log::warn("terrain-overlay null check: bytes mismatch at {} SkyrimSE.exe+{:X}: found {}; not installed", a_what, a_at - REL::Module::get().base(), Hex(found));
			return false;
		}
		return true;
	}

	void InitLog()
	{
		auto path = SKSE::log::log_directory();
		if (!path) {
			return;
		}
		*path /= "rotferns-fixes.log"sv;
		// appended, not truncated: a skip counted in one session survives the relaunches after it (numidium,
		// playtest 48: the log held only the last of about ten launches); each line carries its date
		auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(path->string(), false);
		auto log = std::make_shared<spdlog::logger>("global", std::move(sink));
		log->set_level(spdlog::level::info);
		log->flush_on(spdlog::level::info);
		spdlog::set_default_logger(std::move(log));
		spdlog::set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%l] %v"s);
	}

	// the skip count, every ten seconds when it changed: the run set's evidence that the fix fired
	// (numidium's rules review: "no +02AD242 fault" alone is also what a run without the fix shows)
	void StartSkipReporter()
	{
		std::thread([] {
			std::uint32_t reported = 0;
			for (;;) {
				std::this_thread::sleep_for(10s);
				const auto now = g_skips.load(std::memory_order_relaxed);
				if (now != reported) {
					SKSE::log::info("terrain-overlay null check: skipped {} quads so far", now);
					reported = now;
				}
			}
		}).detach();
	}

	// the install outcomes, one line each; "installed", "wrong runtime" and "bytes mismatch" are the contract
	bool InstallTerrainOverlayNullCheck()
	{
		const auto runtime = REL::Module::get().version();
		if (runtime != kRuntime) {
			SKSE::log::warn("terrain-overlay null check: wrong runtime {} (built for {}); not installed", runtime.string(), kRuntime.string());
			return false;
		}
		const auto base = kSweep.address();
		const auto site = base + kSite;
		if (!Matches(site, kSiteBytes, "the site"sv) || !Matches(base + kResume, kResumeBytes, "the resume"sv) || !Matches(base + kSkip, kSkipBytes, "the skip"sv)) {
			return false;
		}

		auto& trampoline = SKSE::GetTrampoline();
		Detour detour(base + kResume, base + kSkip, reinterpret_cast<std::uintptr_t>(&g_skips));
		detour.ready();
		const auto code = trampoline.allocate(detour);
		trampoline.write_branch<5>(site, reinterpret_cast<std::uintptr_t>(code));
		constexpr std::array<std::uint8_t, 5> nops{ 0x90, 0x90, 0x90, 0x90, 0x90 };
		REL::safe_write(site + 5, std::span<const std::uint8_t>(nops));
		SKSE::log::info("terrain-overlay null check installed at SkyrimSE.exe+{:X} (id 18789+0x{:X}), runtime {}", site - REL::Module::get().base(), kSite, runtime.string());
		StartSkipReporter();
		return true;
	}
}

SKSEPluginLoad(const SKSE::LoadInterface* a_skse)
{
	SKSE::Init(a_skse);
	InitLog();
	SKSE::log::info("Rotfern's Fixes {} loading", REL::Version{ 0, 1, 1, 0 }.string());
	// the detour assembles to about 70 bytes and write_branch<5> takes a 14-byte stub from the same
	// trampoline (CommonLib Trampoline.cpp:141-161); 64 failed the allocation at every launch (the reviews)
	SKSE::AllocTrampoline(128);
	InstallTerrainOverlayNullCheck();
	return true;
}
