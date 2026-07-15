namespace ImG.Core.Math
{
    /// <summary>
    /// Générateur pseudo-aléatoire déterministe (splitmix32).
    ///
    /// Portage bit pour bit de <c>src/core/math/Rng.ts</c> : pour une même
    /// seed, la suite produite est <b>identique</b> à celle du jeu TypeScript
    /// (vérifié par des valeurs de référence dans les tests). Le code de
    /// simulation ne doit jamais utiliser <see cref="System.Random"/> : chaque
    /// sous-système reçoit son propre flux nommé via <see cref="Fork"/>.
    ///
    /// Toute l'arithmétique est en <c>uint</c> (débordement volontaire, comme
    /// le <c>&gt;&gt;&gt; 0</c> / <c>Math.imul</c> de JavaScript).
    /// </summary>
    public sealed class Rng
    {
        private uint _state;
        private readonly uint _seed;

        public Rng(uint seed)
        {
            _seed = seed;
            _state = seed;
        }

        /// <summary>Prochain entier 32 bits non signé.</summary>
        public uint NextUint32()
        {
            unchecked
            {
                uint z = (_state = _state + 0x9e3779b9u);
                z ^= z >> 16;
                z *= 0x21f0aaadu;
                z ^= z >> 15;
                z *= 0x735a2d97u;
                z ^= z >> 15;
                return z;
            }
        }

        /// <summary>Flottant uniforme dans [0, 1).</summary>
        public double Float()
        {
            return NextUint32() / 4294967296.0;
        }

        /// <summary>Entier uniforme dans [min, max] (inclus).</summary>
        public int Int(int min, int max)
        {
            return min + (int)System.Math.Floor(Float() * (max - min + 1));
        }

        /// <summary>Instantané de l'état interne (système de sauvegarde).</summary>
        public uint GetState() => _state;

        /// <summary>Restaure un état capturé par <see cref="GetState"/>.</summary>
        public void SetState(uint state) => _state = state;

        /// <summary>
        /// Dérive un flux indépendant et reproductible depuis la seed
        /// ORIGINALE et un nom de flux (hash FNV-1a). Forker ne consomme pas
        /// d'état : l'ordre de création des flux n'a aucune importance.
        /// </summary>
        public Rng Fork(string stream)
        {
            unchecked
            {
                uint h = 2166136261u;
                for (int i = 0; i < stream.Length; i++)
                {
                    h ^= stream[i];
                    h *= 16777619u;
                }
                return new Rng(_seed ^ h);
            }
        }
    }
}
