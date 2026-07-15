using System;

namespace ImG.Core.Powers
{
    /// <summary>
    /// L'Étincelle divine : ressource de TEMPO (jauge 0–100 qui se régénère
    /// lentement). Les miracles catastrophiques (Courroux, Fléaux) en
    /// consomment, empêchant le spam même quand la Foi abonde. Portage de
    /// <c>src/sim/powers/SparkSystem.ts</c>.
    /// </summary>
    public sealed class SparkSystem
    {
        /// <summary>~+1 point / 3 s de temps réel (10 ticks/s × 0,033).</summary>
        public const double DefaultRegenPerTick = 1.0 / 30.0;

        public double Current;
        public readonly double Max;
        public readonly double RegenPerTick;

        public SparkSystem(double initial = 100, double max = 100, double regenPerTick = DefaultRegenPerTick)
        {
            Max = max;
            Current = System.Math.Min(max, initial);
            RegenPerTick = regenPerTick;
        }

        /// <summary>Dépense atomique : tout ou rien.</summary>
        public bool TrySpend(double amount)
        {
            if (amount < 0 || double.IsNaN(amount) || double.IsInfinity(amount))
                throw new ArgumentException($"SparkSystem.TrySpend: invalid amount {amount}");
            if (amount > Current) return false;
            Current -= amount;
            return true;
        }

        /// <summary>Régénération passive, une fois par tick.</summary>
        public void Update() => Current = System.Math.Min(Max, Current + RegenPerTick);
    }
}
