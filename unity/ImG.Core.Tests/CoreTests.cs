using ImG.Core.Events;
using ImG.Core.Powers;
using ImG.Core.Time;
using ImG.Core.Worldgen;
using Xunit;

namespace ImG.Core.Tests
{
    public class GameClockTests
    {
        [Fact]
        public void Derives_calendar_from_ticks()
        {
            var c = new GameClock();
            // 1 année (48 j) + 1 saison (12 j) + 3 j = jour 63, à midi → été de l'an 1.
            c.Tick = GameClock.TicksPerDay * (GameClock.DaysPerYear + GameClock.DaysPerSeason + 3) + GameClock.TicksPerDay / 2;
            Assert.Equal(Season.Summer, c.Season);
            Assert.Equal(1, c.Year);
            Assert.Equal(0.5, c.TimeOfDay, 10); // midi
            Assert.Equal(1.0, c.Daylight, 10);
        }

        [Fact]
        public void Advance_reports_day_and_season_transitions()
        {
            var c = new GameClock();
            c.Tick = GameClock.TicksPerDay - 1;
            var t = c.Advance();
            Assert.Contains(t, x => x.Kind == TransitionKind.DayStarted);

            c.Tick = GameClock.TicksPerDay * GameClock.DaysPerSeason - 1;
            var t2 = c.Advance();
            Assert.Contains(t2, x => x.Kind == TransitionKind.SeasonChanged);
        }
    }

    public class EventBusTests
    {
        private struct Ping { public int N; }

        [Fact]
        public void Emit_delivers_to_subscribers()
        {
            var bus = new EventBus();
            int got = 0;
            bus.On<Ping>(p => got += p.N);
            bus.Emit(new Ping { N = 5 });
            Assert.Equal(5, got);
        }

        [Fact]
        public void Queue_defers_until_drain()
        {
            var bus = new EventBus();
            int got = 0;
            bus.On<Ping>(p => got += p.N);
            bus.Queue(new Ping { N = 3 });
            Assert.Equal(0, got);
            bus.Drain();
            Assert.Equal(3, got);
        }

        [Fact]
        public void Unsubscribe_stops_delivery()
        {
            var bus = new EventBus();
            int got = 0;
            var off = bus.On<Ping>(p => got += p.N);
            off();
            bus.Emit(new Ping { N = 9 });
            Assert.Equal(0, got);
        }
    }

    public class FaithSparkTests
    {
        [Fact]
        public void Faith_spend_is_atomic()
        {
            var f = new FaithSystem(initial: 50);
            Assert.False(f.TrySpend(80));
            Assert.Equal(50, f.Current);
            Assert.True(f.TrySpend(50));
            Assert.Equal(0, f.Current);
        }

        [Fact]
        public void Faith_add_is_capped()
        {
            var f = new FaithSystem(initial: 1900, max: 2000);
            f.Add(500);
            Assert.Equal(2000, f.Current);
        }

        [Fact]
        public void Spark_regen_is_capped_and_spend_atomic()
        {
            var s = new SparkSystem(initial: 0, max: 100);
            for (int i = 0; i < 300; i++) s.Update();
            Assert.Equal(10, s.Current, 0); // ~+1 / 3 s
            var full = new SparkSystem();
            Assert.False(full.TrySpend(150));
            Assert.True(full.TrySpend(45));
            Assert.Equal(55, full.Current, 6);
        }
    }

    public class BiomeTests
    {
        [Fact]
        public void Below_sea_level_is_ocean()
        {
            Assert.Equal(Biome.Ocean, Biomes.Classify(0.3, 0.6, 0.5, 0.5));
        }

        [Fact]
        public void High_altitude_turns_cold_then_snow()
        {
            // Terrain élevé et chaud au niveau de la mer → sommet enneigé (lapse thermique).
            Assert.Equal(Biome.Snow, Biomes.Classify(0.95, 0.8, 0.5, 0.5));
        }

        [Fact]
        public void Warm_and_wet_lowland_is_tropical()
        {
            Assert.Equal(Biome.TropicalForest, Biomes.Classify(0.55, 0.85, 0.8, 0.5));
        }
    }
}
