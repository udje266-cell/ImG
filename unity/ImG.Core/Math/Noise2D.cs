namespace ImG.Core.Math
{
    /// <summary>
    /// Bruit de valeur 2D avec mouvement brownien fractal (fBm), déterministe.
    /// Portage de <c>src/core/math/Noise2D.ts</c> — même seed + mêmes
    /// coordonnées => même valeur, toujours (vérifié par valeurs de référence).
    /// </summary>
    public sealed class Noise2D
    {
        private readonly uint _seed;

        public Noise2D(uint seed)
        {
            _seed = seed;
        }

        /// <summary>Hash déterministe d'un point du réseau entier vers [0, 1).</summary>
        private double Hash01(int ix, int iy)
        {
            unchecked
            {
                uint h = _seed ^ (uint)(ix * 0x27d4eb2d) ^ (uint)(iy * 0x165667b1);
                h = (h ^ (h >> 15)) * 0x85ebca6bu;
                h = (h ^ (h >> 13)) * 0xc2b2ae35u;
                h ^= h >> 16;
                return h / 4294967296.0;
            }
        }

        /// <summary>Bruit de valeur interpolé (smoothstep) dans [0, 1).</summary>
        public double Value(double x, double y)
        {
            int ix = (int)System.Math.Floor(x);
            int iy = (int)System.Math.Floor(y);
            double fx = x - ix;
            double fy = y - iy;
            double sx = fx * fx * (3 - 2 * fx);
            double sy = fy * fy * (3 - 2 * fy);
            double v00 = Hash01(ix, iy);
            double v10 = Hash01(ix + 1, iy);
            double v01 = Hash01(ix, iy + 1);
            double v11 = Hash01(ix + 1, iy + 1);
            double top = v00 + (v10 - v00) * sx;
            double bottom = v01 + (v11 - v01) * sx;
            return top + (bottom - top) * sy;
        }

        /// <summary>
        /// fBm : somme de couches de bruit à fréquence croissante
        /// (lacunarity) et amplitude décroissante (gain), normalisée sur [0, 1).
        /// </summary>
        public double Fbm(double x, double y, int octaves, double lacunarity = 2, double gain = 0.5)
        {
            double sum = 0;
            double amplitude = 1;
            double frequency = 1;
            double totalAmplitude = 0;
            for (int i = 0; i < octaves; i++)
            {
                sum += amplitude * Value(x * frequency, y * frequency);
                totalAmplitude += amplitude;
                amplitude *= gain;
                frequency *= lacunarity;
            }
            return sum / totalAmplitude;
        }
    }
}
