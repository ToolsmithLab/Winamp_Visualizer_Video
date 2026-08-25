#pragma once

#include <cstdint>

namespace libprojectM {
namespace DeterministicState {

void Configure(uint64_t seed, bool deterministic);
auto Enabled() -> bool;
auto Seed() -> uint64_t;
auto NextSeed32() -> uint32_t;

} // namespace DeterministicState
} // namespace libprojectM
