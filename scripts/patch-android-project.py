import json
import os
import re
from pathlib import Path

# 1. แทรก Service และ Permissions ใน AndroidManifest.xml
manifest_path = 'android/app/src/main/AndroidManifest.xml'
with open(manifest_path, 'r', encoding='utf-8') as f:
    content = f.read()

permissions = '\n'.join([
    '    <uses-permission android:name="android.permission.WAKE_LOCK" />',
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />'
])

service_tag = '\n'.join([
    '        <service',
    '            android:name="com.gt.soundmaster.MediaPlaybackService"',
    '            android:enabled="true"',
    '            android:exported="false"',
    '            android:foregroundServiceType="mediaPlayback" />'
])

music_intent_filters = '\n'.join([
    '            <intent-filter>',
    '                <action android:name="android.intent.action.MUSIC_PLAYER" />',
    '                <category android:name="android.intent.category.DEFAULT" />',
    '                <category android:name="android.intent.category.APP_MUSIC" />',
    '            </intent-filter>',
    '            <intent-filter>',
    '                <action android:name="android.intent.action.VIEW" />',
    '                <category android:name="android.intent.category.DEFAULT" />',
    '                <category android:name="android.intent.category.BROWSABLE" />',
    '                <data android:scheme="file" />',
    '                <data android:scheme="content" />',
    '                <data android:mimeType="audio/*" />',
    '            </intent-filter>'
])

if '<application' in content:
    content = content.replace('<application', permissions + '\n    <application', 1)

content = content.replace('</activity>', music_intent_filters + '\n        </activity>', 1)

if '</application>' in content:
    content = content.replace('</application>', service_tag + '\n    </application>', 1)

with open(manifest_path, 'w', encoding='utf-8') as f:
    f.write(content)

# 2. แก้ไข styles.xml ให้เป็น Dark Theme แท้ บังคับ Status Bar ไอคอนเป็นสีขาวสว่าง
styles_path = 'android/app/src/main/res/values/styles.xml'
if os.path.exists(styles_path):
    with open(styles_path, 'r', encoding='utf-8') as f:
        styles_content = f.read()
    # บังคับ windowLightStatusBar เป็น false และยัด Background ดำป้องกันสีขาวทะลุ
    dark_items = '\n'.join([
        '        <item name="android:windowLightStatusBar">false</item>',
        '        <item name="android:statusBarColor">#180d12</item>',
        '        <item name="android:navigationBarColor">#0D0D12</item>',
        '        <item name="android:windowBackground">#0D0D12</item>'
    ])
    if '</style>' in styles_content:
        # ถอดเลข 1 ออก เพื่อ Inject ค่าลงทุก <style> ปิดตายบัค Status Bar ขาว
        styles_content = styles_content.replace('</style>', dark_items + '\n    </style>')
        with open(styles_path, 'w', encoding='utf-8') as f:
            f.write(styles_content)
        print('Successfully injected Dark Status Bar into styles.xml')

# 3. Apply the repository's single source of truth for the Android app version.
version_config = json.loads(Path('app-version.json').read_text(encoding='utf-8'))
version_name = version_config.get('versionName')
version_code = version_config.get('versionCode')
if not isinstance(version_name, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version_name):
    raise SystemExit('Invalid versionName in app-version.json')
if isinstance(version_code, bool) or not isinstance(version_code, int) or version_code < 1:
    raise SystemExit('Invalid versionCode in app-version.json')

gradle_path = 'android/app/build.gradle'
with open(gradle_path, 'r', encoding='utf-8') as f:
    gradle_content = f.read()

gradle_content, code_count = re.subn(
    r'(?m)^(\s*versionCode\s+)1(\s*)$',
    lambda match: f'{match.group(1)}{version_code}{match.group(2)}',
    gradle_content,
)
gradle_content, name_count = re.subn(
    r'(?m)^(\s*versionName\s+")1\.0(")',
    lambda match: f'{match.group(1)}{version_name}{match.group(2)}',
    gradle_content,
)
if code_count != 1 or name_count != 1:
    raise SystemExit('Expected exactly one default Android versionCode and versionName')

with open(gradle_path, 'w', encoding='utf-8') as f:
    f.write(gradle_content)
print(f'Successfully updated app version to {version_name} (versionCode {version_code})')

