Shader "AirbourneArena/WorldSurface"
{
    Properties
    {
        _BaseMap("Surface", 2D) = "white" {}
        _BaseColor("Authored Tint", Color) = (1,1,1,1)
        _Exposure("World Exposure", Range(0.5, 4)) = 1.35
        _Ambient("Hemisphere Floor", Range(0, 2)) = 0.62
        _SunStrength("Sun Strength", Range(0, 3)) = 0.68
    }
    SubShader
    {
        Tags
        {
            "RenderType"="Opaque"
            "RenderPipeline"="UniversalPipeline"
            "Queue"="Geometry"
        }
        Pass
        {
            Name "Forward"
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
                half4 color : COLOR;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                half4 color : COLOR;
                half3 normalWS : TEXCOORD1;
                half fogFactor : TEXCOORD2;
            };

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);
            float4 _BaseMap_ST;
            half4 _BaseColor;
            half _Exposure;
            half _Ambient;
            half _SunStrength;

            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs position = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = position.positionCS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.color = input.color;
                output.fogFactor = ComputeFogFactor(position.positionCS.z);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half4 surface = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv);
                Light sun = GetMainLight();
                half direct = saturate(dot(normalize(input.normalWS), sun.direction));
                half light = _Ambient + direct * _SunStrength;
                half3 color = surface.rgb * _BaseColor.rgb * input.color.rgb *
                    (_Exposure * light);
                color = MixFog(color, input.fogFactor);
                return half4(color, surface.a * _BaseColor.a);
            }
            ENDHLSL
        }
    }
}
