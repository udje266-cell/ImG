namespace ImG.Core.Worldgen
{
    /// <summary>Les 12 biomes du monde. Portage de <c>src/sim/worldgen/biomes.ts</c>.</summary>
    public enum Biome : byte
    {
        Ocean = 0,
        Beach = 1,
        Grassland = 2,
        TemperateForest = 3,
        TropicalForest = 4,
        Savanna = 5,
        Desert = 6,
        Steppe = 7,
        Taiga = 8,
        Tundra = 9,
        Mountain = 10,
        Snow = 11,
    }

    /// <summary>
    /// Classification des biomes : fonction PURE de (hauteur, température de
    /// base, humidité, niveau de la mer). La chute thermique avec l'altitude
    /// est appliquée ici — d'où la neige au sommet des montagnes et
    /// l'inondation sous le niveau de la mer (cœur du terraforming).
    /// </summary>
    public static class Biomes
    {
        public const int Count = 12;
        public const double AltitudeLapse = 2.0;
        public const double MountainLevel = 0.75;
        public const double BeachBand = 0.02;

        public static Biome Classify(double height, double baseTemperature, double moisture, double seaLevel)
        {
            if (height < seaLevel) return Biome.Ocean;
            if (height < seaLevel + BeachBand) return Biome.Beach;

            double temperature = baseTemperature - AltitudeLapse * (height - seaLevel);

            if (temperature < 0.12) return Biome.Snow;
            if (height >= MountainLevel) return Biome.Mountain;
            if (temperature < 0.24) return Biome.Tundra;
            if (temperature < 0.45) return moisture < 0.35 ? Biome.Steppe : Biome.Taiga;
            if (temperature < 0.7)
            {
                if (moisture < 0.3) return Biome.Steppe;
                if (moisture < 0.62) return Biome.Grassland;
                return Biome.TemperateForest;
            }
            if (moisture < 0.28) return Biome.Desert;
            if (moisture < 0.55) return Biome.Savanna;
            return Biome.TropicalForest;
        }
    }
}
