using System;
using System.Collections.Generic;

namespace ImG.Core.Events
{
    /// <summary>
    /// Bus d'événements typé — le seul canal de communication entre modules
    /// découplés. Portage de <c>src/core/events/EventBus.ts</c>.
    ///
    /// C# étant statiquement typé, les événements sont identifiés par leur
    /// <b>type de charge utile</b> (une struct/classe par événement) plutôt que
    /// par une chaîne. Deux canaux :
    /// <list type="bullet">
    /// <item><c>Emit</c> : synchrone, livré immédiatement.</item>
    /// <item><c>Queue</c> + <c>Drain</c> : différé jusqu'à la fin du tick.</item>
    /// </list>
    /// </summary>
    public sealed class EventBus
    {
        private readonly Dictionary<Type, List<Delegate>> _handlers = new();
        private readonly List<Action> _queued = new();

        /// <summary>S'abonne à un événement. Retourne une action de désabonnement.</summary>
        public Action On<T>(Action<T> handler)
        {
            var type = typeof(T);
            if (!_handlers.TryGetValue(type, out var list))
            {
                list = new List<Delegate>();
                _handlers[type] = list;
            }
            list.Add(handler);
            return () => list.Remove(handler);
        }

        /// <summary>Publie immédiatement à tous les abonnés courants.</summary>
        public void Emit<T>(T payload)
        {
            if (!_handlers.TryGetValue(typeof(T), out var list)) return;
            // Copie : un abonné qui (dé)s'abonne pendant l'émission reste sûr.
            var snapshot = list.ToArray();
            foreach (var handler in snapshot)
            {
                ((Action<T>)handler)(payload);
            }
        }

        /// <summary>Diffère un événement jusqu'au prochain <see cref="Drain"/>.</summary>
        public void Queue<T>(T payload)
        {
            _queued.Add(() => Emit(payload));
        }

        /// <summary>
        /// Livre tous les événements en attente (FIFO). Les événements mis en
        /// file par des handlers pendant le drain sont livrés dans le même
        /// drain, borné par un garde-fou anti-emballement.
        /// </summary>
        public void Drain()
        {
            int guard = 0;
            while (_queued.Count > 0)
            {
                if (++guard > 10_000)
                    throw new InvalidOperationException("EventBus.Drain: runaway event cascade (>10000 events)");
                var batch = _queued.ToArray();
                _queued.Clear();
                foreach (var deliver in batch) deliver();
            }
        }
    }
}
