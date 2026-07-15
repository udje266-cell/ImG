using System.Collections.Generic;
using ImG.Core.Events;
using ImG.Core.Society;
using Xunit;

namespace ImG.Core.Tests
{
    /// <summary>
    /// Ères technologiques — parité avec le TypeScript (<c>tests/sim/era.test.ts</c>).
    /// Les valeurs de référence sont calculées depuis l'implémentation TS pour
    /// garantir un comportement identique entre les deux moteurs.
    /// </summary>
    public class EraTests
    {
        [Fact]
        public void Starts_at_primitive_clan()
        {
            var era = new EraSystem(new EventBus());
            Assert.Equal(Era.Primitive, era.Era);
            Assert.Equal("Âge Primitif", era.CurrentInfo.Name);
            Assert.Equal("Clan", era.CurrentInfo.Politics);
        }

        [Fact]
        public void Knowledge_crosses_thresholds_in_order_once_each()
        {
            var bus = new EventBus();
            var crosses = new List<int>();
            bus.On<EraAdvanced>(e => crosses.Add((int)e.Era));
            var era = new EraSystem(bus);

            for (int i = 0; i < 400; i++) era.Advance(80, 5, 3);

            Assert.Equal(Era.Iron, era.Era);
            Assert.Equal(new[] { 1, 2, 3 }, crosses); // Pierre, Bronze, Fer — une fois chacun
        }

        [Fact]
        public void Matches_typescript_reference_after_100_advances()
        {
            var era = new EraSystem(new EventBus());
            for (int i = 0; i < 100; i++) era.Advance(80, 5, 3);
            // Référence TS : knowledge = 1529.9999999999973, era = Stone.
            Assert.Equal(1529.9999999999973, era.Knowledge, 9);
            Assert.Equal(Era.Stone, era.Era);
        }

        [Fact]
        public void Progress_is_half_at_mid_threshold()
        {
            var era = new EraSystem(new EventBus());
            era.Advance((int)(250 / 0.06), 0, 0); // ~250 de Savoir → mi-chemin de Pierre
            Assert.True(era.Progress > 0.45 && era.Progress < 0.55);
        }

        [Fact]
        public void Iron_is_last_progress_capped_at_one()
        {
            var era = new EraSystem(new EventBus());
            for (int i = 0; i < 1000; i++) era.Advance(100, 8, 5);
            Assert.Equal(Era.Iron, era.Era);
            Assert.Equal(1.0, era.Progress, 10);
            for (int i = 0; i < 100; i++) era.Advance(100, 8, 5);
            Assert.Equal(Era.Iron, era.Era);
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
        public void Restore_clamps_out_of_range_era()
        {
            var era = new EraSystem(new EventBus());
            era.Restore(9999, 99);
            Assert.Equal(Era.Iron, era.Era);
            era.Restore(-5, -3);
            Assert.Equal(Era.Primitive, era.Era);
        }
    }
}
