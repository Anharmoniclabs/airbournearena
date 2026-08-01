using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;

namespace AirbourneArena.Campaign
{
    public interface ICampaignPrimitives
    {
        object Invoke(string name, IReadOnlyList<object> arguments);
    }

    public sealed class CampaignVector3
    {
        public CampaignVector3(double x, double y, double z) =>
            (X, Y, Z) = (x, y, z);

        public double X;
        public double Y;
        public double Z;

        public CampaignVector3 Clone() => new(X, Y, Z);
        public double DistanceTo(CampaignVector3 other)
        {
            var x = X - other.X;
            var y = Y - other.Y;
            var z = Z - other.Z;
            return Math.Sqrt(x * x + y * y + z * z);
        }
    }

    public sealed class CampaignFunction
    {
        internal CampaignFunction(Dictionary<string, object> node, CampaignScope closure)
        {
            Node = node;
            Closure = closure;
        }

        internal Dictionary<string, object> Node { get; }
        internal CampaignScope Closure { get; }
    }

    public sealed class CampaignInterpreter
    {
        const int LoopLimit = 10000;
        readonly ICampaignPrimitives primitives;
        readonly Random random;

        public CampaignInterpreter(ICampaignPrimitives primitives, int randomSeed = 1337)
        {
            this.primitives = primitives ??
                throw new ArgumentNullException(nameof(primitives));
            random = new Random(randomSeed);
        }

        public object Execute(Dictionary<string, object> program,
            IDictionary<string, object> globals = null, params object[] arguments)
        {
            var root = new CampaignScope();
            if (globals != null)
                foreach (var pair in globals)
                    root.Declare(pair.Key, pair.Value);
            return Invoke(new CampaignFunction(program, root), arguments);
        }

        public object Invoke(CampaignFunction function, params object[] arguments)
        {
            if (function == null) throw new ArgumentNullException(nameof(function));
            var scope = new CampaignScope(function.Closure);
            var parameters = List(function.Node, "params", false);
            for (var i = 0; i < parameters.Count; i++)
                scope.Declare((string)parameters[i], i < arguments.Length ? arguments[i] : null);
            try
            {
                return ExecuteStatements(List(function.Node, "body", true), scope);
            }
            catch (ReturnSignal signal)
            {
                return signal.Value;
            }
        }

        object ExecuteStatements(List<object> statements, CampaignScope scope)
        {
            object last = null;
            foreach (var statement in statements) last = Evaluate(statement, scope);
            return last;
        }

        object Evaluate(object node, CampaignScope scope)
        {
            if (node is List<object> list)
            {
                var evaluated = new List<object>(list.Count);
                foreach (var item in list) evaluated.Add(Evaluate(item, scope));
                return evaluated;
            }
            if (node is not Dictionary<string, object> map) return node;
            if (!map.TryGetValue("op", out var operation))
            {
                var evaluated = new Dictionary<string, object>(StringComparer.Ordinal);
                foreach (var pair in map) evaluated[pair.Key] = Evaluate(pair.Value, scope);
                return evaluated;
            }

            return (string)operation switch
            {
                "program" => new CampaignFunction(map, scope),
                "primitive" => InvokePrimitive(map, scope),
                "call" => InvokeCall(map, scope),
                "ref" => scope.Get(String(map, "name")),
                "member" => GetMember(Evaluate(map["target"], scope),
                    EvaluateMemberKey(map["key"], scope)),
                "vector3" => new CampaignVector3(Number(Evaluate(map["x"], scope)),
                    Number(Evaluate(map["y"], scope)), Number(Evaluate(map["z"], scope))),
                "unary" => EvaluateUnary(map, scope),
                "negate" => -Number(Evaluate(map["value"], scope)),
                "binary" => EvaluateBinary(map, scope),
                "conditional" => Truthy(Evaluate(map["test"], scope))
                    ? Evaluate(map["then"], scope)
                    : Evaluate(map["else"], scope),
                "declare" => EvaluateDeclare(map, scope),
                "assign" => EvaluateAssign(map, scope),
                "update" => EvaluateUpdate(map, scope),
                "return" => throw new ReturnSignal(Evaluate(map["value"], scope)),
                "if" => EvaluateIf(map, scope),
                "for" => EvaluateFor(map, scope),
                _ => throw new NotSupportedException(
                    $"Unsupported campaign operation '{operation}'.")
            };
        }

        object InvokePrimitive(Dictionary<string, object> map, CampaignScope scope)
        {
            var values = EvaluateArguments(map, scope);
            return primitives.Invoke(String(map, "target"), values);
        }

        object InvokeCall(Dictionary<string, object> map, CampaignScope scope)
        {
            var args = EvaluateArguments(map, scope);
            if (map["target"] is string target)
            {
                if (target == "rnd")
                {
                    var min = Number(args[0]);
                    var max = Number(args[1]);
                    return min + random.NextDouble() * (max - min);
                }
                if (target == "applyLoadout" || target == "parkArena" ||
                    target == "resetMatch")
                    return primitives.Invoke(target, args);
                var callable = scope.Get(target);
                if (callable is CampaignFunction function)
                    return Invoke(function, args.ToArray());
                throw new NotSupportedException($"Unsupported campaign call '{target}'.");
            }

            var member = map["target"] as Dictionary<string, object> ??
                throw new FormatException("Call target must be a name or member.");
            if (String(member, "op") != "member")
                throw new NotSupportedException("Only member calls are supported.");
            var owner = Evaluate(member["target"], scope);
            var name = Convert.ToString(EvaluateMemberKey(member["key"], scope),
                CultureInfo.InvariantCulture);
            return InvokeMember(owner, name, args);
        }

        object InvokeMember(object owner, string name, List<object> args)
        {
            if (owner is CampaignVector3 vector)
            {
                switch (name)
                {
                    case "clone": return vector.Clone();
                    case "distanceTo": return vector.DistanceTo((CampaignVector3)args[0]);
                    case "set":
                        vector.X = Number(args[0]);
                        vector.Y = Number(args[1]);
                        vector.Z = Number(args[2]);
                        return vector;
                    case "setZ":
                        vector.Z = Number(args[0]);
                        return vector;
                }
            }
            if (ReferenceEquals(owner, MathMarker.Instance))
            {
                return name switch
                {
                    "round" => Math.Round(Number(args[0]), MidpointRounding.AwayFromZero),
                    "cos" => Math.Cos(Number(args[0])),
                    "sin" => Math.Sin(Number(args[0])),
                    _ => throw new NotSupportedException($"Unsupported Math.{name}.")
                };
            }
            if (name == "toFixed")
                return Number(owner).ToString($"F{Convert.ToInt32(Number(args[0]))}",
                    CultureInfo.InvariantCulture);
            if (name == "toUpperCase")
                return Convert.ToString(owner, CultureInfo.InvariantCulture).ToUpperInvariant();
            if (name == "forEach" && owner is List<object> items &&
                args[0] is CampaignFunction callback)
            {
                for (var i = 0; i < items.Count; i++)
                    Invoke(callback, items[i], (double)i, items);
                return null;
            }
            throw new NotSupportedException($"Unsupported campaign member call '{name}'.");
        }

        object EvaluateUnary(Dictionary<string, object> map, CampaignScope scope)
        {
            var value = Evaluate(map["value"], scope);
            return String(map, "operator") switch
            {
                "-" => -Number(value),
                "+" => Number(value),
                "!" => !Truthy(value),
                _ => throw new NotSupportedException("Unsupported unary operator.")
            };
        }

        object EvaluateBinary(Dictionary<string, object> map, CampaignScope scope)
        {
            var op = String(map, "operator");
            var left = Evaluate(map["left"], scope);
            if (op == "&&") return Truthy(left) ? Evaluate(map["right"], scope) : left;
            if (op == "||") return Truthy(left) ? left : Evaluate(map["right"], scope);
            var right = Evaluate(map["right"], scope);
            return op switch
            {
                "+" => left is string || right is string
                    ? ToJsString(left) + ToJsString(right)
                    : Number(left) + Number(right),
                "-" => Number(left) - Number(right),
                "*" => Number(left) * Number(right),
                "/" => Number(left) / Number(right),
                "<" => Number(left) < Number(right),
                "<=" => Number(left) <= Number(right),
                ">" => Number(left) > Number(right),
                ">=" => Number(left) >= Number(right),
                "===" => StrictEquals(left, right),
                "!==" => !StrictEquals(left, right),
                _ => throw new NotSupportedException($"Unsupported binary operator '{op}'.")
            };
        }

        object EvaluateDeclare(Dictionary<string, object> map, CampaignScope scope)
        {
            foreach (var raw in List(map, "bindings", true))
            {
                var binding = (Dictionary<string, object>)raw;
                scope.Declare(String(binding, "name"), Evaluate(binding["value"], scope));
            }
            return null;
        }

        object EvaluateAssign(Dictionary<string, object> map, CampaignScope scope)
        {
            var previous = ReadTarget(map["target"], scope);
            var value = Evaluate(map["value"], scope);
            var assigned = String(map, "operator") switch
            {
                "=" => value,
                "+=" => previous is string || value is string
                    ? ToJsString(previous) + ToJsString(value)
                    : Number(previous) + Number(value),
                "-=" => Number(previous) - Number(value),
                _ => throw new NotSupportedException("Unsupported assignment operator.")
            };
            WriteTarget(map["target"], assigned, scope);
            return assigned;
        }

        object EvaluateUpdate(Dictionary<string, object> map, CampaignScope scope)
        {
            var oldValue = Number(ReadTarget(map["target"], scope));
            var updated = String(map, "operator") switch
            {
                "++" => oldValue + 1,
                "--" => oldValue - 1,
                _ => throw new NotSupportedException("Unsupported update operator.")
            };
            WriteTarget(map["target"], updated, scope);
            return map.TryGetValue("prefix", out var prefix) && Truthy(prefix)
                ? updated
                : oldValue;
        }

        object EvaluateIf(Dictionary<string, object> map, CampaignScope scope)
        {
            var branch = Truthy(Evaluate(map["test"], scope)) ? map["then"] : map["else"];
            if (branch == null) return null;
            return branch is List<object> statements
                ? ExecuteStatements(statements, scope)
                : Evaluate(branch, scope);
        }

        object EvaluateFor(Dictionary<string, object> map, CampaignScope scope)
        {
            Evaluate(map["init"], scope);
            object last = null;
            for (var iterations = 0; Truthy(Evaluate(map["test"], scope)); iterations++)
            {
                if (iterations >= LoopLimit)
                    throw new InvalidOperationException("Campaign loop limit exceeded.");
                var body = map["body"];
                last = body is List<object> statements
                    ? ExecuteStatements(statements, scope)
                    : Evaluate(body, scope);
                Evaluate(map["update"], scope);
            }
            return last;
        }

        object ReadTarget(object target, CampaignScope scope)
        {
            var map = (Dictionary<string, object>)target;
            return String(map, "op") switch
            {
                "ref" => scope.Get(String(map, "name")),
                "member" => GetMember(Evaluate(map["target"], scope),
                    EvaluateMemberKey(map["key"], scope)),
                _ => throw new NotSupportedException("Unsupported assignment target.")
            };
        }

        void WriteTarget(object target, object value, CampaignScope scope)
        {
            var map = (Dictionary<string, object>)target;
            if (String(map, "op") == "ref")
            {
                scope.Set(String(map, "name"), value);
                return;
            }
            if (String(map, "op") != "member")
                throw new NotSupportedException("Unsupported assignment target.");
            SetMember(Evaluate(map["target"], scope),
                EvaluateMemberKey(map["key"], scope), value);
        }

        static object GetMember(object owner, object key)
        {
            if (owner == null) return null;
            if (owner is Dictionary<string, object> dictionary)
                return dictionary.TryGetValue(ToKey(key), out var value) ? value : null;
            if (owner is List<object> list)
            {
                if (ToKey(key) == "length") return (double)list.Count;
                return list[Convert.ToInt32(Number(key))];
            }
            if (owner is CampaignVector3 vector)
            {
                return ToKey(key) switch
                {
                    "x" => vector.X,
                    "y" => vector.Y,
                    "z" => vector.Z,
                    _ => null
                };
            }
            if (owner is string text && ToKey(key) == "length") return (double)text.Length;
            if (ReferenceEquals(owner, MathMarker.Instance) && ToKey(key) == "PI") return Math.PI;
            return null;
        }

        static void SetMember(object owner, object key, object value)
        {
            if (owner is Dictionary<string, object> dictionary)
            {
                dictionary[ToKey(key)] = value;
                return;
            }
            if (owner is List<object> list)
            {
                list[Convert.ToInt32(Number(key))] = value;
                return;
            }
            if (owner is CampaignVector3 vector)
            {
                switch (ToKey(key))
                {
                    case "x": vector.X = Number(value); return;
                    case "y": vector.Y = Number(value); return;
                    case "z": vector.Z = Number(value); return;
                }
            }
            throw new NotSupportedException("Unsupported member assignment.");
        }

        object EvaluateMemberKey(object key, CampaignScope scope) =>
            key is Dictionary<string, object> encoded
                ? Evaluate(encoded, scope)
                : key;

        List<object> EvaluateArguments(Dictionary<string, object> map, CampaignScope scope)
        {
            var result = new List<object>();
            foreach (var argument in List(map, "args", true))
                result.Add(Evaluate(argument, scope));
            return result;
        }

        static bool StrictEquals(object left, object right)
        {
            if (left == null || right == null) return left == right;
            if (IsNumber(left) && IsNumber(right)) return Number(left).Equals(Number(right));
            return left.GetType() == right.GetType() && left.Equals(right);
        }

        static bool Truthy(object value)
        {
            if (value == null) return false;
            if (value is bool boolean) return boolean;
            if (IsNumber(value))
            {
                var number = Number(value);
                return number != 0 && !double.IsNaN(number);
            }
            return value is not string text || text.Length > 0;
        }

        static bool IsNumber(object value) =>
            value is byte or sbyte or short or ushort or int or uint or long or ulong or
                float or double or decimal;

        static double Number(object value)
        {
            if (value == null) return 0;
            if (value is bool boolean) return boolean ? 1 : 0;
            return Convert.ToDouble(value, CultureInfo.InvariantCulture);
        }

        static string ToJsString(object value) => value switch
        {
            null => "null",
            bool boolean => boolean ? "true" : "false",
            _ when IsNumber(value) => Number(value).ToString("G15",
                CultureInfo.InvariantCulture),
            _ => Convert.ToString(value, CultureInfo.InvariantCulture)
        };

        static string ToKey(object value) =>
            value is string text ? text : Convert.ToInt32(Number(value))
                .ToString(CultureInfo.InvariantCulture);

        static string String(Dictionary<string, object> map, string key) =>
            map.TryGetValue(key, out var value) && value is string text
                ? text
                : throw new FormatException($"Expected campaign string '{key}'.");

        static List<object> List(Dictionary<string, object> map, string key, bool required)
        {
            if (map.TryGetValue(key, out var value) && value is List<object> list) return list;
            if (!required) return new List<object>();
            throw new FormatException($"Expected campaign array '{key}'.");
        }

        sealed class ReturnSignal : Exception
        {
            public ReturnSignal(object value) => Value = value;
            public object Value { get; }
        }

        sealed class MathMarker
        {
            public static readonly MathMarker Instance = new();
        }

        public static IDictionary<string, object> CreateStandardGlobals()
        {
            return new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["Math"] = MathMarker.Instance
            };
        }
    }

    public sealed class CampaignScope
    {
        readonly Dictionary<string, object> values =
            new(StringComparer.Ordinal);
        readonly CampaignScope parent;

        public CampaignScope(CampaignScope parent = null) => this.parent = parent;
        public void Declare(string name, object value) => values[name] = value;

        public object Get(string name)
        {
            if (values.TryGetValue(name, out var value)) return value;
            if (parent != null) return parent.Get(name);
            throw new KeyNotFoundException($"Unknown campaign reference '{name}'.");
        }

        public void Set(string name, object value)
        {
            if (values.ContainsKey(name))
            {
                values[name] = value;
                return;
            }
            if (parent != null)
            {
                parent.Set(name, value);
                return;
            }
            values[name] = value;
        }
    }
}
