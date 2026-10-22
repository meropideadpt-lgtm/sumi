"""Capture or compare deterministic screenshots. Updating baselines is explicit."""
from pathlib import Path
import argparse
import json
from PIL import Image, ImageChops
from browser_support import Harness, FIXTURE, PREFS, SIZES

ROOT = Path(__file__).resolve().parent

def capture(folder):
    folder.mkdir(parents=True, exist_ok=True)
    with Harness() as h:
        for name, size in SIZES.items():
            page = h.page(size, FIXTURE, PREFS)
            for view in ['home', 'list', 'stats', 'calendar', 'settings']:
                page.locator(f'[data-nav={view}]').click()
                page.screenshot(path=folder / f'{name}-{view}.png', full_page=True, animations='disabled')
            page.locator('[data-nav=home]').click()
            page.locator('[data-add]').click()
            page.screenshot(path=folder / f'{name}-form.png', full_page=True, animations='disabled')
            page.context.close()

def compare(expected, actual):
    failures = []
    for path in sorted(expected.glob('*.png')):
        old, new = Image.open(path).convert('RGB'), Image.open(actual/path.name).convert('RGB')
        if old.size != new.size:
            failures.append(f'{path.name}: size {old.size} -> {new.size}')
            continue
        diff = ImageChops.difference(old, new)
        changed = sum(max(pixel) > 20 for pixel in diff.get_flattened_data())
        ratio = changed / (old.width * old.height)
        if ratio > .001:
            failures.append(f'{path.name}: {ratio:.2%} pixels changed')
            diff_dir=ROOT/'artifacts'/'diffs'
            diff_dir.mkdir(parents=True,exist_ok=True)
            diff.save(diff_dir / ('diff-' + path.name))
    return failures

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--capture', type=Path)
    parser.add_argument('--against', type=Path, default=ROOT/'baselines')
    args = parser.parse_args()
    destination = args.capture or ROOT/'artifacts'/'visual'
    capture(destination)
    if not args.capture:
        if len(list(args.against.glob('*.png'))) != 18:
            raise SystemExit('Expected 18 reviewed baselines')
        failures = compare(args.against, destination)
        print('\n'.join(failures) if failures else 'PASS: 18 visual baselines')
        raise SystemExit(bool(failures))
    print(f'Captured 18 screenshots in {destination}')
