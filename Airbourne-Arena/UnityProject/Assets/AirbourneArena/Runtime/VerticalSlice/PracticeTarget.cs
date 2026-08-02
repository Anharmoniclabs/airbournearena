using System.Collections.Generic;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    public sealed class PracticeTarget : MonoBehaviour
    {
        public static readonly List<PracticeTarget> Active = new();
        float hitPoints;
        public bool Alive => hitPoints > 0;
        public Vector3 Velocity { get; set; }

        void OnEnable() => Active.Add(this);
        void OnDisable() => Active.Remove(this);

        public void Configure(float hp) => hitPoints = hp;

        public void Hit(float damage)
        {
            if (!Alive) return;
            hitPoints -= damage;
            if (hitPoints <= 0) Destroy(gameObject);
        }
    }
}
