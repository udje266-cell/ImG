using System;
using System.Collections.Generic;
using ImG.Core.Worldgen;

namespace ImG.Core.Terrain
{
    /// <summary>
    /// Terrain du monde : tableaux denses (float32, comme les Float32Array du
    /// TS), suivi des chunks « sales », biomes dérivés. Portage de
    /// <c>src/sim/terrain/TerrainGrid.ts</c>. Toutes les valeurs sont
    /// normalisées dans [0, 1]. Les tableaux sont en <see cref="float"/> pour
    /// reproduire à l'identique la précision du jeu TypeScript.
    /// </summary>
    public sealed class TerrainGrid
    {
        public const int ChunkSize = 32;

        public readonly int Width;
        public readonly int Height;
        public readonly double SeaLevel;
        public readonly int ChunksX;
        public readonly int ChunksY;

        public readonly float[] HeightMap;
        public readonly float[] BaseTemperature;
        public readonly float[] Moisture;
        public readonly float[] BaselineMoisture;
        public readonly byte[] Biomes;

        private double _seasonalTemperatureOffset;
        private readonly HashSet<int> _dirtyChunks = new();

        public TerrainGrid(int width, int height, double seaLevel = 0.5)
        {
            if (width <= 0 || height <= 0) throw new ArgumentException("TerrainGrid: invalid size");
            Width = width;
            Height = height;
            SeaLevel = seaLevel;
            ChunksX = (int)System.Math.Ceiling((double)width / ChunkSize);
            ChunksY = (int)System.Math.Ceiling((double)height / ChunkSize);
            int cells = width * height;
            HeightMap = new float[cells];
            BaseTemperature = new float[cells];
            Moisture = new float[cells];
            BaselineMoisture = new float[cells];
            Biomes = new byte[cells];
        }

        public int Index(int x, int y) => y * Width + x;

        public bool InBounds(int x, int y) => x >= 0 && y >= 0 && x < Width && y < Height;

        public double HeightAt(int x, int y) => HeightMap[Index(x, y)];

        public Biome BiomeAt(int x, int y) => (Biome)Biomes[Index(x, y)];

        public bool IsWater(int x, int y) => HeightAt(x, y) < SeaLevel;

        public int ChunkIdAt(int x, int y) => (y / ChunkSize) * ChunksX + (x / ChunkSize);

        public double SeasonalOffset => _seasonalTemperatureOffset;

        public void SetHeight(int x, int y, double value)
        {
            float clamped = (float)System.Math.Min(1, System.Math.Max(0, value));
            int i = Index(x, y);
            if (HeightMap[i] == clamped) return;
            HeightMap[i] = clamped;
            _dirtyChunks.Add(ChunkIdAt(x, y));
        }

        public void ModifyHeight(int x, int y, double delta) => SetHeight(x, y, HeightAt(x, y) + delta);

        public void SetMoisture(int x, int y, double value)
        {
            float clamped = (float)System.Math.Min(1, System.Math.Max(0, value));
            int i = Index(x, y);
            if (Moisture[i] == clamped) return;
            Moisture[i] = clamped;
            _dirtyChunks.Add(ChunkIdAt(x, y));
        }

        /// <summary>
        /// Décalage thermique saisonnier : re-classifie tout le monde (une fois
        /// par changement de saison — la neige descend en hiver).
        /// </summary>
        public void SetSeasonalTemperatureOffset(double offset)
        {
            if (_seasonalTemperatureOffset == offset) return;
            _seasonalTemperatureOffset = offset;
            for (int id = 0; id < ChunksX * ChunksY; id++) _dirtyChunks.Add(id);
        }

        /// <summary>Recalcule les biomes des chunks sales ; renvoie leurs ids (triés).</summary>
        public List<int> RefreshDirtyChunks()
        {
            if (_dirtyChunks.Count == 0) return new List<int>();
            var ids = new List<int>(_dirtyChunks);
            ids.Sort();
            _dirtyChunks.Clear();
            foreach (int id in ids) RefreshChunkBiomes(id);
            return ids;
        }

        /// <summary>Recalcule tous les biomes — utilisé une fois après la génération.</summary>
        public void RefreshAllBiomes()
        {
            for (int y = 0; y < Height; y++)
                for (int x = 0; x < Width; x++)
                    RefreshCellBiome(x, y);
            _dirtyChunks.Clear();
        }

        private void RefreshChunkBiomes(int chunkId)
        {
            int x0 = (chunkId % ChunksX) * ChunkSize;
            int y0 = (chunkId / ChunksX) * ChunkSize;
            int x1 = System.Math.Min(x0 + ChunkSize, Width);
            int y1 = System.Math.Min(y0 + ChunkSize, Height);
            for (int y = y0; y < y1; y++)
                for (int x = x0; x < x1; x++)
                    RefreshCellBiome(x, y);
        }

        private void RefreshCellBiome(int x, int y)
        {
            int i = Index(x, y);
            Biomes[i] = (byte)Worldgen.Biomes.Classify(
                HeightMap[i],
                BaseTemperature[i] + _seasonalTemperatureOffset,
                Moisture[i],
                SeaLevel);
        }
    }
}
