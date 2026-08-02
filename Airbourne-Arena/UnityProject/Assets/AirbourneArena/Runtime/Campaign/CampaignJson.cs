using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace AirbourneArena.Campaign
{
    // Compact JSON reader used for the generated campaign AST. Keeping this in
    // the runtime avoids a reflection-heavy package in the WebGL payload.
    public static class CampaignJson
    {
        public static object Parse(string json)
        {
            if (string.IsNullOrEmpty(json))
                throw new ArgumentException("Campaign JSON is empty.", nameof(json));
            using var parser = new Parser(json);
            return parser.ParseRoot();
        }

        sealed class Parser : IDisposable
        {
            const string WordBreak = "{}[],:\"";
            readonly StringReader reader;

            public Parser(string json) => reader = new StringReader(json);
            public void Dispose() => reader.Dispose();

            public object ParseRoot()
            {
                var value = ParseValue();
                EatWhitespace();
                if (reader.Peek() != -1) throw Error("Unexpected trailing content");
                return value;
            }

            object ParseValue()
            {
                EatWhitespace();
                return PeekToken() switch
                {
                    Token.String => ParseString(),
                    Token.Number => ParseNumber(),
                    Token.Object => ParseObject(),
                    Token.Array => ParseArray(),
                    Token.True => ReadWord("true", true),
                    Token.False => ReadWord("false", false),
                    Token.Null => ReadWord("null", null),
                    _ => throw Error("Expected a JSON value")
                };
            }

            Dictionary<string, object> ParseObject()
            {
                reader.Read();
                var result = new Dictionary<string, object>(StringComparer.Ordinal);
                while (true)
                {
                    EatWhitespace();
                    if (reader.Peek() == '}')
                    {
                        reader.Read();
                        return result;
                    }
                    if (reader.Peek() != '"') throw Error("Expected an object key");
                    var key = ParseString();
                    EatWhitespace();
                    if (reader.Read() != ':') throw Error("Expected ':'");
                    result[key] = ParseValue();
                    EatWhitespace();
                    var next = reader.Read();
                    if (next == '}') return result;
                    if (next != ',') throw Error("Expected ',' or '}'");
                }
            }

            List<object> ParseArray()
            {
                reader.Read();
                var result = new List<object>();
                while (true)
                {
                    EatWhitespace();
                    if (reader.Peek() == ']')
                    {
                        reader.Read();
                        return result;
                    }
                    result.Add(ParseValue());
                    EatWhitespace();
                    var next = reader.Read();
                    if (next == ']') return result;
                    if (next != ',') throw Error("Expected ',' or ']'");
                }
            }

            string ParseString()
            {
                if (reader.Read() != '"') throw Error("Expected string");
                var value = new StringBuilder();
                while (true)
                {
                    var current = reader.Read();
                    if (current < 0) throw Error("Unterminated string");
                    if (current == '"') return value.ToString();
                    if (current != '\\')
                    {
                        value.Append((char)current);
                        continue;
                    }
                    var escaped = reader.Read();
                    if (escaped < 0) throw Error("Unterminated escape");
                    switch ((char)escaped)
                    {
                        case '"': value.Append('"'); break;
                        case '\\': value.Append('\\'); break;
                        case '/': value.Append('/'); break;
                        case 'b': value.Append('\b'); break;
                        case 'f': value.Append('\f'); break;
                        case 'n': value.Append('\n'); break;
                        case 'r': value.Append('\r'); break;
                        case 't': value.Append('\t'); break;
                        case 'u':
                            var hex = new char[4];
                            for (var i = 0; i < hex.Length; i++)
                            {
                                var digit = reader.Read();
                                if (digit < 0) throw Error("Unterminated unicode escape");
                                hex[i] = (char)digit;
                            }
                            value.Append((char)Convert.ToInt32(new string(hex), 16));
                            break;
                        default: throw Error("Unsupported escape");
                    }
                }
            }

            object ParseNumber()
            {
                var token = ReadUntilWordBreak();
                if (token.IndexOfAny(new[] { '.', 'e', 'E' }) >= 0 &&
                    double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture,
                        out var floating))
                    return floating;
                if (long.TryParse(token, NumberStyles.Integer, CultureInfo.InvariantCulture,
                        out var integer))
                    return integer;
                throw Error($"Invalid number '{token}'");
            }

            object ReadWord(string expected, object value)
            {
                var actual = ReadUntilWordBreak();
                if (actual != expected) throw Error($"Expected '{expected}'");
                return value;
            }

            Token PeekToken()
            {
                EatWhitespace();
                return reader.Peek() switch
                {
                    '{' => Token.Object,
                    '[' => Token.Array,
                    '"' => Token.String,
                    '-' => Token.Number,
                    >= '0' and <= '9' => Token.Number,
                    't' => Token.True,
                    'f' => Token.False,
                    'n' => Token.Null,
                    _ => Token.None
                };
            }

            string ReadUntilWordBreak()
            {
                var word = new StringBuilder();
                while (reader.Peek() != -1 && !char.IsWhiteSpace((char)reader.Peek()) &&
                       WordBreak.IndexOf((char)reader.Peek()) < 0)
                    word.Append((char)reader.Read());
                return word.ToString();
            }

            void EatWhitespace()
            {
                while (reader.Peek() != -1 && char.IsWhiteSpace((char)reader.Peek()))
                    reader.Read();
            }

            FormatException Error(string message) =>
                new($"Invalid campaign JSON: {message}.");

            enum Token { None, Object, Array, String, Number, True, False, Null }
        }
    }
}
