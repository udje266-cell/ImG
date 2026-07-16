using System.Collections.Generic;
using ImG.Core.Events;
using ImG.Core.Society;
using Xunit;

namespace ImG.Core.Tests
{
    /// <summary>
    /// Les dix âges de la civilisation — parité avec le TypeScript
    /// (<c>tests/sim/era.test.ts</c>). Les valeurs de référence sont calculées
    /// depuis l'implémentation TS pour garantir un comportement identique.
    /// </summary>
    public class EraTests
    {
        [Fact]
        public void Starts_at_stone_tribe()
        {
            var era = new EraSystem(new EventBus());
            Assert.Equal(Era.Stone, era.Era);
            Assert.Equal("Âge de Pierre", era.CurrentInfo.Name);
            Assert.Equal("Tribu", era.CurrentInfo.Politics);
        }

        [Fact]
        public void Knowledge_crosses_ten_thresholds_in_order_once_each()
        {
            var bus = new EventBus();
            var crosses = new List<int>();
            bus.On<EraAdvanced>(e => crosses.Add((int)e.Era));
            var era = new EraSystem(bus);

            for (int i = 0; i < 10000; i++) era.Advance(80, 5, 3);

            Assert.Equal(Era.Galactic, era.Era);
            Assert.Equal(new[] { 1, 2, 3, 4, 5, 6, 7, 8, 9 }, crosses); // Bronze … Galactique, une fois chacun
        }

        [Fact]
        public void Matches_typescript_reference_after_100_advances()
        {
            var era = new EraSystem(new EventBus());
            for (int i = 0; i < 100; i++) era.Advance(80, 5, 3);
            // Référence TS : knowledge = 1529.9999999999973 → Bronze (≥ 500, < 2200).
            Assert.Equal(1529.9999999999973, era.Knowledge, 9);
            Assert.Equal(Era.Bronze, era.Era);
        }

        [Fact]
        public void Progress_is_half_at_mid_threshold()
        {
            var era = new EraSystem(new EventBus());
            era.Advance((int)(250 / 0.06), 0, 0); // ~250 de Savoir → mi-chemin du Bronze
            Assert.True(era.Progress > 0.45 && era.Progress < 0.55);
            Assert.Equal(Era.Stone, era.Era);
        }

        [Fact]
        public void Galactic_is_last_progress_capped_at_one()
        {
            var era = new EraSystem(new EventBus());
            for (int i = 0; i < 8000; i++) era.Advance(100, 8, 5);
            Assert.Equal(Era.Galactic, era.Era);
            Assert.Equal(1.0, era.Progress, 10);
            for (int i = 0; i < 100; i++) era.Advance(100, 8, 5);
            Assert.Equal(Era.Galactic, era.Era);
        }

        [Fact]
        public void Serialize_restore_round_trips()
        {
            var a = new EraSystem(new EventBus());
            for (int i = 0; i < 50; i++) a.Advance(40, 3, 1);
            var (knowledge, eraIdx) = a.Serialize();
            var b = new EraSystem(new EventBus());
            b.Restore(knowledge, eraIdx);
            Assert.Equal(a.Era, b.Era);
            Assert.Equal(a.Knowledge, b.Knowledge, 10);
        }

        [Fact]
        public void Has_ten_eras_in_historical_order()
        {
            Assert.Equal(10, EraSystem.EraCount);
            Assert.Equal(10, EraSystem.Info.Length);
            var names = new List<string>();
            foreach (var info in EraSystem.Info) names.Add(info.Name);
            Assert.Equal(new[]
            {
                "Âge de Pierre", "Âge du Bronze", "Âge du Fer", "Moyen Âge",
                "Renaissance", "Révolution Industrielle", "Époque Moderne", "Futur",
                "Ère Interplanétaire", "Ère Galactique",
            }, names);
        }

        [Fact]
        public void Restore_clamps_out_of_range_era()
        {
            var era = new EraSystem(new EventBus());
            era.Restore(99999, 99);
            Assert.Equal(Era.Galactic, era.Era);
            era.Restore(-5, -3);
            Assert.Equal(Era.Stone, era.Era);
        }
    }
}
