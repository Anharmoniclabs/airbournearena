using System;

namespace AirbourneArena.Flight
{
    [Serializable]
    public struct FlightVector
    {
        public double x, y, z;

        public FlightVector(double x, double y, double z)
        {
            this.x = x; this.y = y; this.z = z;
        }

        public double Length => Math.Sqrt(x * x + y * y + z * z);
        public double LengthSquared => x * x + y * y + z * z;
        public FlightVector Normalized => Length > 1e-12 ? this / Length : new FlightVector();

        public static FlightVector Cross(FlightVector a, FlightVector b) =>
            new FlightVector(a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
        public static double Dot(FlightVector a, FlightVector b) =>
            a.x * b.x + a.y * b.y + a.z * b.z;
        public static FlightVector operator +(FlightVector a, FlightVector b) =>
            new FlightVector(a.x + b.x, a.y + b.y, a.z + b.z);
        public static FlightVector operator -(FlightVector a, FlightVector b) =>
            new FlightVector(a.x - b.x, a.y - b.y, a.z - b.z);
        public static FlightVector operator *(FlightVector a, double n) =>
            new FlightVector(a.x * n, a.y * n, a.z * n);
        public static FlightVector operator /(FlightVector a, double n) =>
            new FlightVector(a.x / n, a.y / n, a.z / n);
    }

    [Serializable]
    public struct FlightQuaternion
    {
        public double x, y, z, w;
        public static FlightQuaternion Identity => new FlightQuaternion(0, 0, 0, 1);

        public FlightQuaternion(double x, double y, double z, double w)
        {
            this.x = x; this.y = y; this.z = z; this.w = w;
        }

        public static FlightQuaternion AxisAngle(FlightVector axis, double radians)
        {
            axis = axis.Normalized;
            double half = radians * 0.5, s = Math.Sin(half);
            return new FlightQuaternion(axis.x * s, axis.y * s, axis.z * s, Math.Cos(half));
        }

        public static FlightQuaternion operator *(FlightQuaternion a, FlightQuaternion b) =>
            new FlightQuaternion(
                a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
                a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
                a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
                a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);

        public FlightVector Rotate(FlightVector v)
        {
            var q = new FlightVector(x, y, z);
            var t = FlightVector.Cross(q, v) * 2;
            return v + t * w + FlightVector.Cross(q, t);
        }

        public FlightQuaternion Normalized
        {
            get
            {
                double n = Math.Sqrt(x * x + y * y + z * z + w * w);
                return new FlightQuaternion(x / n, y / n, z / n, w / n);
            }
        }
    }
}
