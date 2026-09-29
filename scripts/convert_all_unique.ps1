[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public class AkrutiConverter {
    [DllImport(@"D:\PROJECTS\BHARUNDI PIYAT SAHKARI MANDALI\set\akruti\akruti\AKRUTI PUBLISHER 6.0\SYSTEM\guj401wi.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    private static extern IntPtr GujToIsciiC(byte[] input);

    public static string Convert(string input) {
        if (string.IsNullOrEmpty(input)) return input;

        // Check if string is already Unicode Gujarati (U+0A80..U+0AFF)
        bool hasGuj = false;
        foreach (char c in input) {
            if (c >= 0x0A80 && c <= 0x0AFF) {
                hasGuj = true;
                break;
            }
        }
        if (hasGuj) return input;

        // Clean deleted / cancelled markers
        string cleaned = input.Trim();
        cleaned = Regex.Replace(cleaned, @"\u00D6+", "");
        while (cleaned.Length > 0 && (cleaned[0] == '*' || cleaned[0] == '#' || cleaned[0] == '?' || cleaned[0] == '~')) {
            cleaned = cleaned.Substring(1).Trim();
        }

        // Akruti font typing aliases
        cleaned = cleaned.Replace("'", "\u2018"); // ' (0x27) -> ‘ (0x91, ક)
        cleaned = cleaned.Replace(";", "\u00FC"); // ; -> ü (ટ)
        cleaned = cleaned.Replace("\u00A2", "\u00E8\u00DF"); // ¢ -> જી

        // Block / Survey number substitutions
        cleaned = cleaned.Replace("ÆÜæ‘ß", "પૈકી");
        cleaned = cleaned.Replace("ÆÜåå‘ß", "પૈકી");
        cleaned = cleaned.Replace("-†", "-અ").Replace("/†", "/અ");
        cleaned = cleaned.Replace("-ËÜ", "-બ").Replace("/ËÜ", "/બ");
        cleaned = cleaned.Replace("-‘", "-ક").Replace("/‘", "/ક");
        cleaned = cleaned.Replace("/Ü", "/");

        // Split into words by space
        string[] words = cleaned.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        StringBuilder result = new StringBuilder();

        for (int w = 0; w < words.Length; w++) {
            if (w > 0) result.Append(' ');
            result.Append(ConvertWord(words[w]));
        }

        string unicode = result.ToString();

        // Post-processing standard cleanup
        unicode = unicode.Replace("આો", "ઓ");
        unicode = unicode.Replace("ઇશ્રર", "ઇશ્વર");
        unicode = unicode.Replace("ઈશ્રર", "ઈશ્વર");
        unicode = unicode.Replace("ર્લે", "લે");
        unicode = unicode.Replace("પ;ૌલ", "પટેલ");
        unicode = unicode.Replace("પ;ોલ", "પટેલ");
        unicode = unicode.Replace("ભારુન્ડી", "ભારૂંડી");
        unicode = unicode.Replace("ભરૂન્ડી", "ભારૂંડી");
        unicode = unicode.Replace("ગુઊઊણવંત", "ગુણવંત");
        unicode = unicode.Replace("ડાહયા", "ડાહ્યા");
        unicode = unicode.Replace("ખાતુ", "ખાતું");
        unicode = Regex.Replace(unicode, @"\bબી લેણાં\b", "બાકી લેણાં");
        unicode = Regex.Replace(unicode, @"\bબેં\b", "બેંક");
        unicode = Regex.Replace(unicode, @"\bઆવ\b", "આવક");
        unicode = Regex.Replace(unicode, @"ખચઋ+", "ખર્ચ");
        unicode = Regex.Replace(unicode, @"\bખચ\b", "ખર્ચ");

        return unicode.Trim();
    }

    private static string ConvertWord(string w) {
        if (string.IsNullOrWhiteSpace(w)) return w;

        // If word contains any Gujarati Unicode character, it's already converted
        foreach (char c in w) {
            if (c >= 0x0A80 && c <= 0x0AFF) return w;
        }

        // Check if word contains any Akruti character (byte > 127)
        bool hasAkruti = false;
        foreach (char c in w) {
            if (c > 127) {
                hasAkruti = true;
                break;
            }
        }
        if (!hasAkruti) return w;

        // Skip standalone orphan matras
        if (w.Length == 1 && (w[0] == '\u00DC' || w[0] == '\u00E0' || w[0] == '\u00E1' || w[0] == '\u00E5' || w[0] == '\u00E6' || w[0] == '\u00D8' || w[0] == '\u00DF' || w[0] == '\u00DB')) {
            return "";
        }

        bool hasKa = false;
        if (w.Length > 1 && w.IndexOf('\u2018', 1) > 0) {
            w = Regex.Replace(w, @"(?<=[^\s])\u2018", " \u2018");
            hasKa = true;
        }

        byte[] bytes = Encoding.GetEncoding(1252).GetBytes(w);
        byte[] nullTerm = new byte[bytes.Length + 1];
        Array.Copy(bytes, nullTerm, bytes.Length);

        IntPtr ptr = IntPtr.Zero;
        try {
            ptr = GujToIsciiC(nullTerm);
        } catch {
            return w;
        }

        if (ptr == IntPtr.Zero) return w;

        string resStr = Marshal.PtrToStringAnsi(ptr);
        byte[] isciiBytes = Encoding.GetEncoding("ISO-8859-1").GetBytes(resStr);

        string decoded = DecodeIscii(isciiBytes);
        if (hasKa) {
            decoded = decoded.Replace(" \u0A95", "\u0A95");
        }
        return decoded;
    }

    private static string DecodeIscii(byte[] isciiBytes) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < isciiBytes.Length; i++) {
            byte b = isciiBytes[i];
            switch (b) {
                case 0x20: sb.Append(' '); break;
                case 0xA1: sb.Append('\u0A81'); break; // ઁ
                case 0xA2: sb.Append('\u0A82'); break; // ં
                case 0xA3: sb.Append('\u0A83'); break; // ઃ
                case 0xA4: sb.Append('\u0A85'); break; // અ
                case 0xA5: sb.Append('\u0A86'); break; // આ
                case 0xA6: sb.Append('\u0A87'); break; // ઇ
                case 0xA7: sb.Append('\u0A88'); break; // ઈ
                case 0xA8: sb.Append('\u0A89'); break; // ઉ
                case 0xA9: sb.Append('\u0A8A'); break; // ઊ
                case 0xAA: sb.Append('\u0A8B'); break; // ઋ
                case 0xAB: sb.Append('\u0A8D'); break; // ઍ
                case 0xAC: sb.Append('\u0A8F'); break; // એ
                case 0xAD: sb.Append('\u0A90'); break; // ઐ
                case 0xAE: sb.Append('\u0A91'); break; // ઑ
                case 0xAF: sb.Append('\u0A93'); break; // ઓ
                case 0xB0: sb.Append('\u0A94'); break; // ઔ

                case 0xB3: sb.Append('\u0A95'); break; // ક
                case 0xB4: sb.Append('\u0A96'); break; // ખ
                case 0xB5: sb.Append('\u0A97'); break; // ગ
                case 0xB6: sb.Append('\u0A98'); break; // ઘ
                case 0xB7: sb.Append('\u0A99'); break; // ઙ
                case 0xB8: sb.Append('\u0A9A'); break; // ચ
                case 0xB9: sb.Append('\u0A9B'); break; // છ
                case 0xBA: sb.Append('\u0A9C'); break; // જ
                case 0xBB: sb.Append('\u0A9D'); break; // ઝ
                case 0xBC: sb.Append('\u0A9E'); break; // ઞ
                case 0xBD: sb.Append('\u0A9F'); break; // ટ
                case 0xBE: sb.Append('\u0AA0'); break; // ઠ
                case 0xBF: sb.Append('\u0AA1'); break; // ડ
                case 0xC0: sb.Append('\u0AA2'); break; // ઢ
                case 0xC1: sb.Append('\u0AA3'); break; // ણ
                case 0xC2: sb.Append('\u0AA4'); break; // ત
                case 0xC3: sb.Append('\u0AA5'); break; // થ
                case 0xC4: sb.Append('\u0AA6'); break; // દ
                case 0xC5: sb.Append('\u0AA7'); break; // ધ
                case 0xC6: sb.Append('\u0AA8'); break; // ન
                case 0xC7: sb.Append('\u0AAA'); break; // પ
                case 0xC8: sb.Append('\u0AAA'); break; // પ
                case 0xC9: sb.Append('\u0AAB'); break; // ફ
                case 0xCA: sb.Append('\u0AAC'); break; // બ
                case 0xCB: sb.Append('\u0AAD'); break; // ભ
                case 0xCC: sb.Append('\u0AAE'); break; // મ
                case 0xCD: sb.Append('\u0AAF'); break; // ય
                case 0xCE: sb.Append('\u0AB0'); break; // ર
                case 0xCF: sb.Append('\u0AB0'); break; // ર
                case 0xD0: sb.Append('\u0AB3'); break; // ળ
                case 0xD1: sb.Append('\u0AB2'); break; // લ
                case 0xD2: sb.Append('\u0AB3'); break; // ળ
                case 0xD3: sb.Append('\u0AB3'); break; // ળ
                case 0xD4: sb.Append('\u0AB5'); break; // વ
                case 0xD5: sb.Append('\u0AB6'); break; // શ
                case 0xD6: sb.Append('\u0AB7'); break; // ષ
                case 0xD7: sb.Append('\u0AB8'); break; // સ
                case 0xD8: sb.Append('\u0AB9'); break; // હ

                case 0xDA: sb.Append('\u0ABE'); break; // ા
                case 0xDB: sb.Append('\u0ABF'); break; // િ
                case 0xDC: sb.Append('\u0AC0'); break; // ી
                case 0xDD: sb.Append('\u0AC1'); break; // ુ
                case 0xDE: sb.Append('\u0AC2'); break; // ૂ
                case 0xDF: sb.Append('\u0AC3'); break; // ૃ
                case 0xE0: sb.Append('\u0AC5'); break; // ૅ
                case 0xE1: sb.Append('\u0AC7'); break; // ે
                case 0xE2: sb.Append('\u0AC8'); break; // ૈ
                case 0xE3: sb.Append('\u0AC9'); break; // ૉ
                case 0xE4: sb.Append('\u0ACB'); break; // ો
                case 0xE5: sb.Append('\u0ACB'); break; // ો (in Akruti guj401wi, 0xE5 is O matra)
                case 0xE8: sb.Append('\u0ACD'); break; // ્
                case 0xE9: sb.Append('\u0ACD'); break; // ્
                case 0xEA: sb.Append('\u0ABC'); break; // ઼

                case 0xF1: sb.Append('\u0AE6'); break; // ૦
                case 0xF2: sb.Append('\u0AE7'); break; // ૧
                case 0xF3: sb.Append('\u0AE8'); break; // ૨
                case 0xF4: sb.Append('\u0AE9'); break; // ૩
                case 0xF5: sb.Append('\u0AEA'); break; // ૪
                case 0xF6: sb.Append('\u0AEB'); break; // ૫
                case 0xF7: sb.Append('\u0AEC'); break; // ૬
                case 0xF8: sb.Append('\u0AED'); break; // ૭
                case 0xF9: sb.Append('\u0AEE'); break; // ૮
                case 0xFA: sb.Append('\u0AEF'); break; // ૯

                default:
                    if (b >= 32 && b <= 126) {
                        sb.Append((char)b);
                    }
                    break;
            }
        }
        return sb.ToString();
    }
}
"@
Add-Type -TypeDefinition $source

$jsonPath = "D:\PROJECTS\BHARUNDI PIYAT SAHKARI MANDALI\backend\scripts\data\unique_strings.json"
$outPath = "D:\PROJECTS\BHARUNDI PIYAT SAHKARI MANDALI\backend\scripts\data\converted_dict.json"

Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength = 2147483647

$items = $serializer.DeserializeObject([System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8))
$dict = New-Object 'System.Collections.Generic.Dictionary[string, string]'

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$count = 0
foreach ($str in $items) {
    if ([string]::IsNullOrEmpty($str)) { continue }
    $conv = [AkrutiConverter]::Convert($str)
    $dict[$str] = $conv
    $count++
    if ($count % 200 -eq 0) {
        Write-Host ("Processed {0} / {1}" -f $count, $items.Length)
    }
}
$sw.Stop()

$outJson = $serializer.Serialize($dict)
[System.IO.File]::WriteAllText($outPath, $outJson, [System.Text.Encoding]::UTF8)
Write-Host ("Finished! Converted {0} strings in {1} ms. Saved to {2}" -f $count, $sw.ElapsedMilliseconds, $outPath)
