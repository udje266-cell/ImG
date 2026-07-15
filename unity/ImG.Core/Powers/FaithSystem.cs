using System;

namespace ImG.Core.Powers
{
    /// <summary>
    /// La Foi : ressource divine principale (produite par les croyants,
    /// dépensée par les pouvoirs). Portage de <c>src/sim/powers/FaithSystem.ts</c>.
    /// </summary>
    public sealed class FaithSystem
    {
        public double Current;
        public readonly double Max;
        public readonly double RegenPerTick;

        public FaithSystem(double initial = 1000, double max = 2000, double regenPerTick = 4)
        {
            Max = max;
            Current = System.Math.Min(max, initial);
            RegenPerTick = regenPerTick;
        }

        /// <summary>Dépense atomique : tout est payé, ou rien ne se passe.</summary>
        public bool TrySpend(double amount)
        {
            if (amount < 0 || double.IsNaN(amount) || double.IsInfinity(amount))
                throw new ArgumentException($"FaithSystem.TrySpend: invalid amount {amount}");
            if (amount > Current) return false;
            Current -= amount;
            return true;
        }

        /// <summary>Ajoute de la Foi (revenu des croyants), plafonnée au max.</summary>
        public void Add(double amount)
        {
            if (amount < 0 || double.IsNaN(amount) || double.IsInfinity(amount))
                throw new ArgumentException($"FaithSystem.Add: invalid amount {amount}");
            Current = System.Math.Min(Max, Current + amount);
        }

        /// <summary>Régénération passive de base, une fois par tick.</summary>
        public void Update() => Add(RegenPerTick);
    }
}
