using System.Collections.Generic;

namespace ImG.Core.Time
{
    public enum Season { Spring = 0, Summer = 1, Autumn = 2, Winter = 3 }

    public enum TransitionKind { DayStarted, SeasonChanged, YearStarted }

    public readonly struct ClockTransition
    {
        public readonly TransitionKind Kind;
        public readonly int Day;
        public readonly Season Season;
        public readonly int Year;

        public ClockTransition(TransitionKind kind, int day, Season season, int year)
        {
            Kind = kind;
            Day = day;
            Season = season;
            Year = year;
        }
    }

    /// <summary>
    /// Calendrier de simulation : le tick est l'unique source de vérité ;
    /// jour/nuit, saisons et années en sont dérivés. Portage de
    /// <c>src/core/time/GameClock.ts</c>.
    /// </summary>
    public sealed class GameClock
    {
        public const int SimDtMs = 100;
        public const int TicksPerDay = 240;
        public const int DaysPerSeason = 12;
        public const int SeasonCount = 4;
        public const int DaysPerYear = DaysPerSeason * SeasonCount;

        public long Tick;

        /// <summary>Fraction du jour courant dans [0, 1) : 0 = minuit, 0.5 = midi.</summary>
        public double TimeOfDay => (double)(Tick % TicksPerDay) / TicksPerDay;

        /// <summary>Nombre de jours absolus depuis la création du monde.</summary>
        public long Day => Tick / TicksPerDay;

        public long DayOfSeason => Day % DaysPerSeason;

        public Season Season => (Season)((Day / DaysPerSeason) % SeasonCount);

        public long Year => Day / DaysPerYear;

        /// <summary>Facteur d'ensoleillement [0, 1] : 0 à minuit, 1 à midi (cosinus).</summary>
        public double Daylight => 0.5 - 0.5 * System.Math.Cos(TimeOfDay * 2 * System.Math.PI);

        /// <summary>Avance d'un tick et renvoie les transitions de calendrier survenues.</summary>
        public List<ClockTransition> Advance()
        {
            long previousDay = Day;
            Season previousSeason = Season;
            long previousYear = Year;
            Tick++;

            var transitions = new List<ClockTransition>();
            if (Day == previousDay) return transitions;

            transitions.Add(new ClockTransition(TransitionKind.DayStarted, (int)Day, Season, (int)Year));
            if (Season != previousSeason)
                transitions.Add(new ClockTransition(TransitionKind.SeasonChanged, (int)Day, Season, (int)Year));
            if (Year != previousYear)
                transitions.Add(new ClockTransition(TransitionKind.YearStarted, (int)Day, Season, (int)Year));
            return transitions;
        }
    }
}
