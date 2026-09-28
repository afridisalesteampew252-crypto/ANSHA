"""Prepare the generated Capacitor Android shell for ANSHA branding and cutouts.

Run after cap add/sync, before Gradle builds. Both APK workflows share this step.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import sys

ROOT = Path("android/app/src/main")
RES = ROOT / "res"
SOURCE = Path("public/icons/icon-512.png")
if not SOURCE.is_file():
    raise SystemExit(f"Missing launcher source: {SOURCE}")
logo = Image.open(SOURCE).convert("RGBA")
if logo.width < 192 or logo.height < 192:
    raise SystemExit("Launcher source is too small")

# Android legacy icon dimensions; adaptive layers are 108dp per density.
densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for density, scale in densities.items():
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    size = round(48 * scale)
    square = logo.resize((size, size), Image.Resampling.LANCZOS)
    square.save(folder / "ic_launcher.png")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    round_icon = square.copy()
    round_icon.putalpha(Image.composite(square.getchannel("A"), Image.new("L", (size, size), 0), mask))
    round_icon.save(folder / "ic_launcher_round.png")

    adaptive_size = round(108 * scale)
    foreground = Image.new("RGBA", (adaptive_size, adaptive_size))
    # Keep the whole logo within Android's central safe zone when cropped by launchers.
    inner = round(66 * scale)
    mark = logo.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (adaptive_size - inner) // 2
    foreground.alpha_composite(mark, (offset, offset))
    foreground.save(folder / "ic_launcher_foreground.png")

xml_dir = RES / "mipmap-anydpi-v26"
xml_dir.mkdir(parents=True, exist_ok=True)
for filename in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (xml_dir / filename).write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )
values = RES / "values"
values.mkdir(parents=True, exist_ok=True)
(values / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources><color name="ic_launcher_background">#FFFFFF</color></resources>\n'
)

activities = list((ROOT / "java").rglob("MainActivity.java"))
if len(activities) != 1:
    raise SystemExit(f"Expected one generated MainActivity, found {len(activities)}")
activity = activities[0]
java = activity.read_text()
needle = "public class MainActivity extends BridgeActivity {}"
replacement = """public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15+ draws edge to edge. Keep the WebView (including fixed headers)
        // inside the status/navigation bars and display cutout on every device.
        android.view.View content = findViewById(android.R.id.content);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            androidx.core.graphics.Insets safe = insets.getInsets(
                androidx.core.view.WindowInsetsCompat.Type.systemBars()
                | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        });
        androidx.core.view.ViewCompat.requestApplyInsets(content);
    }
}"""
if needle not in java:
    raise SystemExit("Generated MainActivity changed; refusing an unsafe patch")
activity.write_text(java.replace(needle, replacement))
print(f"Installed branded icons and cutout insets for {activity}")
