$ErrorActionPreference = 'Stop'

if (-not ('AgyCredentialReader.NativeMethods' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace AgyCredentialReader {
    public static class NativeMethods {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct Credential {
            public UInt32 Flags;
            public UInt32 Type;
            public string TargetName;
            public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public UInt32 CredentialBlobSize;
            public IntPtr CredentialBlob;
            public UInt32 Persist;
            public UInt32 AttributeCount;
            public IntPtr Attributes;
            public string TargetAlias;
            public string UserName;
        }

        [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

        [DllImport("Advapi32.dll", SetLastError = true)]
        public static extern void CredFree(IntPtr buffer);
    }
}
'@
}

$pointer = [IntPtr]::Zero
$ok = [AgyCredentialReader.NativeMethods]::CredRead('gemini:antigravity', 1, 0, [ref]$pointer)
if (-not $ok) {
    throw 'The agy credential was not found. Run agy and sign in once.'
}

try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
        $pointer,
        [type][AgyCredentialReader.NativeMethods+Credential]
    )
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)

    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
        $value = $utf8.GetString($bytes)
    }
    catch {
        $value = [Text.Encoding]::Unicode.GetString($bytes)
    }

    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    [Console]::Out.Write($value)
}
finally {
    [AgyCredentialReader.NativeMethods]::CredFree($pointer)
}
