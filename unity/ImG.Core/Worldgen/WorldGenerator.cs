using System;
using ImG.Core.Math;
using ImG.Core.Terrain;

namespace ImG.Core.Worldgen
{
    /// <summary>
    /// Génération procédurale du monde. Pipeline pur : seed + config en entrée,
    /// TerrainGrid en sortie — même seed, même monde. Portage de
    /// <c>src/sim/worldgen/WorldGenerator.ts</c>, à l'identique (mêmes flux RNG,
    /// même stockage float32).
    /// </summary>
    public static class WorldGenerator
    {
        private const double HeightScale = 1.0 / 56.0;
        private const double MoistureScale = 1.0 / 36.0;
        private const double TemperatureNoiseScale = 1.0 / 28.0;

        public static TerrainGrid Generate(uint seed, int width, int height, double seaLevel = 0.5)
        {
            var grid = new TerrainGrid(width, height, seaLevel);

            // Flux nommés indépendants : ajouter une couche ne rebat pas les autres.
            var rng = new Rng(seed);
            var heightNoise = new Noise2D(rng.Fork("worldgen:height").NextUint32());
            var moistureNoise = new Noise2D(rng.Fork("worldgen:moisture").NextUint32());
            var temperatureNoise = new Noise2D(rng.Fork("worldgen:temperature").NextUint32());

            for (int y = 0; y < height; y++)
            {
                // 0 à l'équateur (centre), 1 aux pôles (bords haut/bas).
                double latitude = System.Math.Abs((2.0 * y) / (height - 1) - 1);
                for (int x = 0; x < width; x++)
                {
                    int i = grid.Index(x, y);

                    double h = heightNoise.Fbm(x * HeightScale, y * HeightScale, 5);
                    grid.HeightMap[i] = (float)System.Math.Pow(h, 1.2);

                    double wobble = temperatureNoise.Value(x * TemperatureNoiseScale, y * TemperatureNoiseScale) - 0.5;
                    double temperature = 0.92 * (1 - latitude * latitude * 0.95) + 0.16 * wobble;
                    grid.BaseTemperature[i] = (float)System.Math.Min(1, System.Math.Max(0, temperature));

                    grid.Moisture[i] = (float)moistureNoise.Fbm(x * MoistureScale, y * MoistureScale, 4);
                }
            }

            // L'humidité générée est l'équilibre vers lequel la météo ramène le sol.
            Array.Copy(grid.Moisture, grid.BaselineMoisture, grid.Moisture.Length);

            grid.RefreshAllBiomes();
            return grid;
        }
    }
}
