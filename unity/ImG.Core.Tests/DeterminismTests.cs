using ImG.Core.Math;
using ImG.Core.Worldgen;
using Xunit;

namespace ImG.Core.Tests
{
    /// <summary>
    /// Tests de NON-RÉGRESSION cross-langage : les valeurs de référence sont
    /// extraites de l'implémentation TypeScript de référence (via vitest). Si
    /// le portage C# dérive d'un seul bit, ces tests cassent — c'est la
    /// garantie que le cœur reste rigoureusement identique au jeu web.
    /// </summary>
    public class DeterminismTests
    {
        [Fact]
        public void Rng_matches_typescript_sequence()
        {
            var r = new Rng(1337);
            uint[] expected = { 1225747897, 1829388979, 3226345298, 268931369, 2474398691, 859128070 };
            foreach (var e in expected)
                Assert.Equal(e, r.NextUint32());
        }

        [Fact]
        public void Rng_float_matches_typescript()
        {
            var r = new Rng(1337);
            Assert.Equal(0.28539167181588709, r.Float(), 15);
        }

        [Fact]
        public void Rng_fork_matches_typescript()
        {
            var f = new Rng(1337).Fork("worldgen:height");
            Assert.Equal(842921798u, f.NextUint32());
        }

        [Fact]
        public void Rng_int_matches_typescript()
        {
            var r = new Rng(42);
            int[] expected = { 12, 3, 7, 70, 21 };
            foreach (var e in expected)
                Assert.Equal(e, r.Int(0, 99));
        }

        [Fact]
        public void Rng_fork_is_order_independent_and_stateless()
        {
            var baseA = new Rng(7);
            var a1 = baseA.Fork("alpha").NextUint32();
            var b1 = baseA.Fork("beta").NextUint32();

            var baseB = new Rng(7);
            var b2 = baseB.Fork("beta").NextUint32();
            var a2 = baseB.Fork("alpha").NextUint32();

            Assert.Equal(a1, a2);
            Assert.Equal(b1, b2);
        }

        [Fact]
        public void Noise_matches_typescript()
        {
            var n = new Noise2D(123456);
            Assert.Equal(0.66221301701443736, n.Value(3.5, 7.25), 14);
            Assert.Equal(0.61962011287499574, n.Fbm(3.5, 7.25, 5), 14);
        }

        [Fact]
        public void WorldGen_matches_typescript_reference()
        {
            var g = WorldGenerator.Generate(1337, 64, 64);

            double heightSum = 0, moistSum = 0;
            var biomeCounts = new int[Biomes.Count];
            for (int i = 0; i < g.HeightMap.Length; i++)
            {
                heightSum += g.HeightMap[i];
                moistSum += g.Moisture[i];
                biomeCounts[g.Biomes[i]]++;
            }

            // Sommes float32 accumulées en double, arrondies à 6 décimales comme le TS.
            Assert.Equal(1990.411657, System.Math.Round(heightSum, 6), 3);
            Assert.Equal(2386.580496, System.Math.Round(moistSum, 6), 3);

            int[] expectedBiomes = { 2288, 380, 274, 278, 285, 33, 0, 0, 200, 85, 5, 268 };
            Assert.Equal(expectedBiomes, biomeCounts);

            // Cellules ponctuelles (valeurs float32 exactes).
            Assert.Equal(0.45134741067886353, g.HeightMap[0], 6);
            Assert.Equal(0.48098361492156982, g.HeightMap[1000], 6);
        }

        [Fact]
        public void WorldGen_is_deterministic()
        {
            var a = WorldGenerator.Generate(2024, 48, 48);
            var b = WorldGenerator.Generate(2024, 48, 48);
            Assert.Equal(a.HeightMap, b.HeightMap);
            Assert.Equal(a.Biomes, b.Biomes);
        }
    }
}
