using ImG.Core.Events;

namespace ImG.Core.Society
{
    /// <summary>Les huit grands âges de la civilisation (de la pierre au futur).</summary>
    public enum Era
    {
        Stone = 0,
        Bronze = 1,
        Iron = 2,
        Medieval = 3,
        Renaissance = 4,
        Industrial = 5,
        Modern = 6,
        Future = 7,
    }

    /// <summary>Charge utile de l'événement « changement d'ère ».</summary>
    public readonly struct EraAdvanced
    {
        public readonly Era Era;
        public readonly string Name;
        public readonly string Politics;

        public EraAdvanced(Era era, string name, string politics)
        {
            Era = era;
            Name = name;
            Politics = politics;
        }
    }

    /// <summary>Nom, politique et icône d'une ère.</summary>
    public readonly struct EraInfo
    {
        public readonly string Name;
        public readonly string Politics;
        public readonly string Icon;

        public EraInfo(string name, string politics, string icon)
        {
            Name = name;
            Politics = politics;
            Icon = icon;
        }
    }

    /// <summary>
    /// Ères technologiques (docs/GDD.md §7). La civilisation évolue de l'âge
    /// primitif à l'âge du fer, poussée par le <b>Savoir</b> qui s'accumule avec
    /// la population, les villages et les temples. Franchir un palier change
    /// l'ère (bâtiments, monuments, apparence, politique). Portage de
    /// <c>src/sim/society/EraSystem.ts</c> — pur et déterministe.
    /// </summary>
    public sealed class EraSystem
    {
        public const int EraCount = 8;
        /// <summary>Dernière ère (borne haute).</summary>
        public const Era LastEra = Era.Future;

        /// <summary>Savoir cumulé requis pour ATTEINDRE chaque ère (index = ère).</summary>
        public static readonly double[] EraKnowledge = { 0, 500, 2200, 6000, 12000, 22000, 38000, 60000 };

        public static readonly EraInfo[] Info =
        {
            new EraInfo("Âge de Pierre", "Tribu", "🪨"),
            new EraInfo("Âge du Bronze", "Chefferie", "⚒️"),
            new EraInfo("Âge du Fer", "Royaume", "🛡️"),
            new EraInfo("Moyen Âge", "Féodalité", "🏰"),
            new EraInfo("Renaissance", "Cité-État", "🎨"),
            new EraInfo("Révolution Industrielle", "Nation", "🏭"),
            new EraInfo("Époque Moderne", "République", "🏙️"),
            new EraInfo("Futur", "Fédération", "🚀"),
        };

        /// <summary>Cadence (ticks) d'accumulation du Savoir.</summary>
        public const int EraInterval = 50;
        private const double KnowledgePerCapita = 0.06;
        private const double KnowledgePerVillage = 0.6;
        private const double KnowledgePerTemple = 2.5;

        private readonly EventBus _bus;
        private double _knowledge;
        private Era _era = Era.Stone;

        public EraSystem(EventBus bus)
        {
            _bus = bus;
        }

        public double Knowledge => _knowledge;
        public Era Era => _era;
        public EraInfo CurrentInfo => Info[(int)_era];

        /// <summary>Progression [0, 1] vers l'ère suivante (1 si déjà à l'âge du fer).</summary>
        public double Progress
        {
            get
            {
                if (_era >= LastEra) return 1;
                double from = EraKnowledge[(int)_era];
                double to = EraKnowledge[(int)_era + 1];
                double t = (_knowledge - from) / (to - from);
                return t < 0 ? 0 : (t > 1 ? 1 : t);
            }
        }

        /// <summary>
        /// Accumule le Savoir selon l'état de la civilisation et fait progresser
        /// l'ère si un palier est franchi (peut sauter plusieurs paliers d'un coup).
        /// </summary>
        public void Advance(int population, int villages, int temples)
        {
            _knowledge +=
                population * KnowledgePerCapita +
                villages * KnowledgePerVillage +
                temples * KnowledgePerTemple;

            while (_era < LastEra && _knowledge >= EraKnowledge[(int)_era + 1])
            {
                _era++;
                var info = Info[(int)_era];
                _bus.Emit(new EraAdvanced(_era, info.Name, info.Politics));
            }
        }

        public (double knowledge, int era) Serialize() => (_knowledge, (int)_era);

        public void Restore(double knowledge, int era)
        {
            _knowledge = knowledge;
            int clamped = era < 0 ? 0 : (era > (int)LastEra ? (int)LastEra : era);
            _era = (Era)clamped;
        }
    }
}
