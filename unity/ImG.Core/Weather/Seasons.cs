using ImG.Core.Time;

namespace ImG.Core.Weather
{
    /// <summary>
    /// Décalage thermique appliqué à la classification des biomes selon la
    /// saison (docs/GDD.md §3.4). Positif en été (les biomes chauds s'étendent),
    /// négatif en hiver. Portage de <c>src/sim/weather/seasons.ts</c>.
    /// </summary>
    public static class Seasons
    {
        public static double Offset(Season season) => season switch
        {
            Season.Summer => 0.12,
            Season.Winter => -0.12,
            _ => 0.0, // printemps, automne
        };
    }
}
