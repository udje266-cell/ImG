using System;
using ImG.Core.Math;
using ImG.Core.Terrain;

namespace ImG.Core.Weather
{
    /// <summary>
    /// Météo cellulaire (docs/GDD.md §3.4) sur une grille grossière
    /// (1 cellule = <see cref="WeatherCell"/> tuiles), cadencée tous les
    /// <see cref="WeatherInterval"/> ticks. Boucle de l'eau entièrement
    /// déterministe (flux RNG « weather ») : évaporation au-dessus de l'eau →
    /// nuages advectés par le vent → précipitations sur les terres saturées →
    /// l'humidité du sol monte → sans pluie, elle revient vers l'équilibre.
    ///
    /// Portage de <c>src/sim/weather/WeatherSystem.ts</c>. Le tableau de nuages
    /// est en <see cref="float"/> pour reproduire à l'identique la précision des
    /// <c>Float32Array</c> du jeu TypeScript (chaque écriture est arrondie en
    /// float32).
    /// </summary>
    public sealed class WeatherSystem
    {
        public const int WeatherCell = 8;
        public const int WeatherInterval = 5;

        /// <summary>Couverture au-dessus de laquelle il pleut (ou neige sur sol froid).</summary>
        public const double PrecipitationThreshold = 0.62;
        private const double RainMoisture = 0.01;
        private const double RainDepletion = 0.045;
        private const double Evaporation = 0.035;
        private const double DryRate = 0.002;
        private const double Dissipation = 0.996;
        /// <summary>Température de base du sol sous laquelle la pluie tombe en neige.</summary>
        public const double SnowTemperature = 0.3;

        public readonly int CellsX;
        public readonly int CellsY;
        /// <summary>Couverture nuageuse par cellule, [0, 1].</summary>
        public readonly float[] Cloud;
        public double WindAngle;

        private double _advectionX;
        private double _advectionY;
        private readonly Rng _rng;
        private readonly TerrainGrid _terrain;

        public WeatherSystem(TerrainGrid terrain, Rng baseRng)
        {
            _terrain = terrain;
            CellsX = (int)System.Math.Ceiling((double)terrain.Width / WeatherCell);
            CellsY = (int)System.Math.Ceiling((double)terrain.Height / WeatherCell);
            Cloud = new float[CellsX * CellsY];
            _rng = baseRng.Fork("weather");
            WindAngle = _rng.Float() * System.Math.PI * 2;
            for (int i = 0; i < Cloud.Length; i++)
                Cloud[i] = (float)(_rng.Float() * 0.4);
        }

        public int CellIndex(int cx, int cy) => cy * CellsX + cx;

        public double CloudAt(int cx, int cy) => Cloud[CellIndex(cx, cy)];

        /// <summary>Pluie en cours dans cette cellule ? (rendu + gameplay)</summary>
        public bool IsRaining(int cx, int cy) =>
            CloudAt(cx, cy) > PrecipitationThreshold && !IsCellOverWater(cx, cy);

        /// <summary>Neige plutôt que pluie : sol froid (latitude/saison).</summary>
        public bool IsSnowing(int cx, int cy)
        {
            if (!IsRaining(cx, cy)) return false;
            var (x, y) = CellCentreTile(cx, cy);
            return _terrain.BaseTemperature[_terrain.Index(x, y)] + _terrain.SeasonalOffset < SnowTemperature;
        }

        /// <summary>Sature les nuages autour d'un point (utilisé par le pouvoir Pluie).</summary>
        public void SeedClouds(int tileX, int tileY, int tileRadius)
        {
            int cx0 = (int)System.Math.Floor((double)(tileX - tileRadius) / WeatherCell);
            int cy0 = (int)System.Math.Floor((double)(tileY - tileRadius) / WeatherCell);
            int cx1 = (int)System.Math.Floor((double)(tileX + tileRadius) / WeatherCell);
            int cy1 = (int)System.Math.Floor((double)(tileY + tileRadius) / WeatherCell);
            for (int cy = System.Math.Max(0, cy0); cy <= System.Math.Min(CellsY - 1, cy1); cy++)
                for (int cx = System.Math.Max(0, cx0); cx <= System.Math.Min(CellsX - 1, cx1); cx++)
                    Cloud[CellIndex(cx, cy)] = 1f;
        }

        /// <summary>Un pas de météo (appelé tous les <see cref="WeatherInterval"/> ticks).</summary>
        public void Update()
        {
            DriftWind();
            Advect();

            for (int cy = 0; cy < CellsY; cy++)
            {
                for (int cx = 0; cx < CellsX; cx++)
                {
                    int i = CellIndex(cx, cy);
                    bool overWater = IsCellOverWater(cx, cy);

                    if (overWater)
                    {
                        Cloud[i] = (float)System.Math.Min(1, Cloud[i] + Evaporation);
                    }
                    else if (Cloud[i] > PrecipitationThreshold)
                    {
                        Cloud[i] = (float)(Cloud[i] - RainDepletion);
                        RainOnCell(cx, cy);
                    }

                    Cloud[i] = (float)(Cloud[i] * Dissipation);
                }
            }

            DrySoil();
        }

        /// <summary>Le vent tourne lentement et aléatoirement (déterministe).</summary>
        private void DriftWind() => WindAngle += (_rng.Float() - 0.5) * 0.15;

        /// <summary>Advection : décale la grille d'une cellule quand le vent a assez soufflé.</summary>
        private void Advect()
        {
            const double speed = 0.35; // cellules par update
            _advectionX += System.Math.Cos(WindAngle) * speed;
            _advectionY += System.Math.Sin(WindAngle) * speed;
            while (System.Math.Abs(_advectionX) >= 1)
            {
                Shift(System.Math.Sign(_advectionX), 0);
                _advectionX -= System.Math.Sign(_advectionX);
            }
            while (System.Math.Abs(_advectionY) >= 1)
            {
                Shift(0, System.Math.Sign(_advectionY));
                _advectionY -= System.Math.Sign(_advectionY);
            }
        }

        /// <summary>Décalage torique de la grille de nuages.</summary>
        private void Shift(int dx, int dy)
        {
            var source = (float[])Cloud.Clone();
            for (int cy = 0; cy < CellsY; cy++)
            {
                for (int cx = 0; cx < CellsX; cx++)
                {
                    int sx = (cx - dx + CellsX) % CellsX;
                    int sy = (cy - dy + CellsY) % CellsY;
                    Cloud[CellIndex(cx, cy)] = source[CellIndex(sx, sy)];
                }
            }
        }

        private void RainOnCell(int cx, int cy)
        {
            int x0 = cx * WeatherCell;
            int y0 = cy * WeatherCell;
            int x1 = System.Math.Min(x0 + WeatherCell, _terrain.Width);
            int y1 = System.Math.Min(y0 + WeatherCell, _terrain.Height);
            for (int y = y0; y < y1; y++)
            {
                for (int x = x0; x < x1; x++)
                {
                    if (_terrain.IsWater(x, y)) continue;
                    int i = _terrain.Index(x, y);
                    _terrain.SetMoisture(x, y, _terrain.Moisture[i] + RainMoisture);
                }
            }
        }

        /// <summary>Sans pluie, l'humidité revient lentement vers l'équilibre généré.</summary>
        private void DrySoil()
        {
            for (int i = 0; i < _terrain.Moisture.Length; i++)
            {
                double gap = _terrain.BaselineMoisture[i] - _terrain.Moisture[i];
                if (System.Math.Abs(gap) < 0.0005) continue;
                int x = i % _terrain.Width;
                int y = i / _terrain.Width;
                _terrain.SetMoisture(x, y, _terrain.Moisture[i] + gap * DryRate);
            }
        }

        private bool IsCellOverWater(int cx, int cy)
        {
            var (x, y) = CellCentreTile(cx, cy);
            return _terrain.IsWater(x, y);
        }

        private (int x, int y) CellCentreTile(int cx, int cy) => (
            System.Math.Min(_terrain.Width - 1, cx * WeatherCell + WeatherCell / 2),
            System.Math.Min(_terrain.Height - 1, cy * WeatherCell + WeatherCell / 2));

        /// <summary>Snapshot pour la sauvegarde (v2).</summary>
        public WeatherState Serialize() => new WeatherState
        {
            Cloud = (float[])Cloud.Clone(),
            WindAngle = WindAngle,
            AdvectionX = _advectionX,
            AdvectionY = _advectionY,
            RngState = _rng.GetState(),
        };

        /// <summary>Restauration depuis une sauvegarde (v2).</summary>
        public void Restore(WeatherState data)
        {
            if (data.Cloud.Length != Cloud.Length)
                throw new InvalidOperationException("Corrupted save: weather grid size mismatch");
            Array.Copy(data.Cloud, Cloud, Cloud.Length);
            WindAngle = data.WindAngle;
            _advectionX = data.AdvectionX;
            _advectionY = data.AdvectionY;
            _rng.SetState(data.RngState);
        }
    }

    /// <summary>État sérialisé de la météo (sauvegarde v2).</summary>
    public struct WeatherState
    {
        public float[] Cloud;
        public double WindAngle;
        public double AdvectionX;
        public double AdvectionY;
        public uint RngState;
    }
}
