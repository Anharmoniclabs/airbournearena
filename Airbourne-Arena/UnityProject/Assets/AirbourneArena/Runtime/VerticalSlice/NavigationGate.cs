using System;
using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    [RequireComponent(typeof(Collider))]
    public sealed class NavigationGate : MonoBehaviour
    {
        UnityFlightBody player;
        Action passed;
        Vector3 previousPlayerPosition;
        bool hasPrevious;
        [SerializeField] float traversalRadius = 70;

        public void Initialize(UnityFlightBody flightBody, Action callback)
        {
            player = flightBody;
            passed = callback;
            GetComponent<Collider>().isTrigger = true;
        }

        void Update()
        {
            if (!player) return;
            var current = player.transform.position;
            if (hasPrevious && SegmentDistance(previousPlayerPosition, current, transform.position) <
                traversalRadius)
                Pass();
            previousPlayerPosition = current;
            hasPrevious = true;
            transform.Rotate(0, 0, 30 * Time.deltaTime, Space.Self);
        }

        void OnTriggerEnter(Collider other)
        {
            if (!player || !other.transform.IsChildOf(player.transform) && other.transform != player.transform)
                return;
            Pass();
        }

        void Pass()
        {
            if (passed == null) return;
            var callback = passed;
            passed = null;
            callback?.Invoke();
            Destroy(gameObject);
        }

        static float SegmentDistance(Vector3 start, Vector3 end, Vector3 point)
        {
            var segment = end - start;
            var lengthSquared = segment.sqrMagnitude;
            var t = lengthSquared < 1e-9f ? 0 :
                Mathf.Clamp01(Vector3.Dot(point - start, segment) / lengthSquared);
            return Vector3.Distance(start + segment * t, point);
        }
    }
}
