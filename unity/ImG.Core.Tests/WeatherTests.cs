using ImG.Core.Math;
using ImG.Core.Terrain;
using ImG.Core.Time;
using ImG.Core.Weather;
using ImG.Core.Worldgen;
using Xunit;

namespace ImG.Core.Tests
{
    /// <summary>
    /// Météo cellulaire — parité cross-langage avec le TypeScript
    /// (<c>src/sim/weather/WeatherSystem.ts</c>). Le monde est généré avec la
    /// même graine (worldgen déjà vérifié bit pour bit), puis 20 pas de météo
    /// sont simulés ; les agrégats doivent coïncider avec la référence TS.
    /// </summary>
    public class WeatherTests
    {
        private static (TerrainGrid terrain, WeatherSystem weather) Setup()
        {
            // Câblage identique à la Simulation : worldgen forke depuis la graine,
            // la météo forke « weather » depuis un Rng frais sur la même graine.
            var terrain = WorldGenerator.Generate(1337, 64, 64);
            var weather = new WeatherSystem(terrain, new Rng(1337));
            return (terrain, weather);
        }

        [Fact]
        public void Matches_typescript_reference_after_20_updates()
        {
            var (terrain, weather) = Setup();
            for (int i = 0; i < 20; i++) weather.Update();

            double cloudSum = 0;
            foreach (var c in weather.Cloud) cloudSum += c;
            double moistSum = 0;
            foreach (var m in terrain.Moisture) moistSum += m;

            Assert.Equal(8, weather.CellsX);
            Assert.Equal(8, weather.CellsY);
            Assert.Equal(3.613015569379205, weather.WindAngle, 10);
            Assert.Equal(34.7342549264431, cloudSum, 5);
            Assert.Equal(2397.1026667952538, moistSum, 4);
            Assert.Equal(0.417036235332489, weather.Cloud[0], 6);
            Assert.Equal(0.5772556662559509, weather.Cloud[50], 6);
        }

        [Fact]
        public void Seed_clouds_saturates_and_rains_on_land()
        {
            var (terrain, weather) = Setup();
            // Trouve une tuile de terre pour garantir une cellule « terrestre ».
            int lx = -1, ly = -1;
            for (int y = 0; y < terrain.Height && lx < 0; y++)
                for (int x = 0; x < terrain.Width && lx < 0; x++)
                    if (!terrain.IsWater(x, y)) { lx = x; ly = y; }
            Assert.True(lx >= 0);

            weather.SeedClouds(lx, ly, 4);
            int cx = lx / WeatherSystem.WeatherCell;
            int cy = ly / WeatherSystem.WeatherCell;
            Assert.True(weather.CloudAt(cx, cy) > WeatherSystem.PrecipitationThreshold);
        }

        [Fact]
        public void Serialize_restore_round_trips()
        {
            var (_, a) = Setup();
            for (int i = 0; i < 7; i++) a.Update();
            var state = a.Serialize();

            var terrainB = WorldGenerator.Generate(1337, 64, 64);
            var b = new WeatherSystem(terrainB, new Rng(1337));
            b.Restore(state);

            Assert.Equal(a.WindAngle, b.WindAngle, 12);
            Assert.Equal(a.Cloud, b.Cloud);
            // Après restauration, un pas de plus produit le même vent (RNG restauré).
            a.Update();
            b.Update();
            Assert.Equal(a.WindAngle, b.WindAngle, 12);
        }

        [Fact]
        public void Seasonal_offset_matches_typescript()
        {
            Assert.Equal(0.0, Seasons.Offset(Season.Spring), 12);
            Assert.Equal(0.12, Seasons.Offset(Season.Summer), 12);
            Assert.Equal(0.0, Seasons.Offset(Season.Autumn), 12);
            Assert.Equal(-0.12, Seasons.Offset(Season.Winter), 12);
        }
    }
}
