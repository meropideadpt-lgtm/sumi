"""Capture or compare deterministic screenshots. Updating baselines is explicit."""
from pathlib import Path
import argparse
import copy
from PIL import Image, ImageChops
from browser_support import Harness, FIXTURE, PREFS, SIZES

ROOT = Path(__file__).resolve().parent
BASELINE_COUNT = 28

def statistics_history_fixture():
    """Synthetic observed plans and successful payments, never live financial data."""
    subscriptions = [
        {'id':'design','name':'设计工具','amount':180,'currency':'USD','months':12,
         'nextDate':'2026-11-15','billingAnchor':'2024-11-15','status':'active',
         'autoRenew':True,'logo':'','category':'开发工具'},
        {'id':'music-history','name':'音乐会员','amount':18,'currency':'CNY','months':1,
         'nextDate':'2026-08-01','billingAnchor':'2024-01-01','status':'cancelled',
         'autoRenew':False,'logo':'','category':'影音娱乐'},
        {'id':'cloud-history','name':'云存储','amount':120,'currency':'HKD','months':12,
         'nextDate':'2027-03-31','billingAnchor':'2025-03-31','status':'active',
         'autoRenew':True,'logo':'','category':'云存储'},
    ]
    history = []
    def observation(subscription_id, date, kind, **changes):
        current = next(item for item in subscriptions if item['id'] == subscription_id)
        item = {key:current[key] for key in ['name','category','amount','currency','months','status']}
        item.update(changes)
        history.append({**item,'id':'history-'+str(len(history)+1),'subscriptionId':subscription_id,
                        'effectiveDate':date,'observedAt':date+'T08:00:00.000Z','kind':kind})
    observation('music-history','2024-01-01','created',amount=12,status='active')
    observation('music-history','2024-03-01','changed',amount=15,status='active')
    observation('music-history','2024-06-01','changed',amount=12,status='active')
    observation('design','2024-11-15','created',amount=120,category='工作效率')
    observation('music-history','2025-01-01','changed',status='active')
    observation('cloud-history','2025-03-31','created')
    observation('design','2025-11-15','changed',category='工作效率')
    observation('design','2026-07-01','changed')
    observation('music-history','2026-08-01','changed')
    payments = []
    def payment(subscription_id, date, rate_date, amount, currency, rates):
        current = next(item for item in subscriptions if item['id'] == subscription_id)
        rate = rates['CNY'] / rates[currency]
        frozen = {'version':1,'status':'available','provider':'frankfurter','sourceCurrency':currency,
                  'sourceAmount':amount,'displayCurrency':'CNY','base':'EUR','rate':rate,
                  'convertedAmount':round(amount*rate,2),'date':rate_date,
                  'fetchedAt':rate_date+'T16:00:00.000Z','confirmedAt':date+'T08:00:00.000Z',
                  'rates':rates,'reason':None}
        payments.append({'id':'payment-history-'+str(len(payments)+1),'subscriptionId':subscription_id,
                         'name':current['name'],'date':date,'amount':amount,'currency':currency,
                         'status':'succeeded','advancesSchedule':False,'fxSnapshot':frozen})
    payment('design','2024-11-15','2024-11-14',120,'USD',{'EUR':1,'USD':1.1,'CNY':7.8,'HKD':8.6})
    payment('design','2025-11-15','2025-11-14',180,'USD',{'EUR':1,'USD':1.08,'CNY':8,'HKD':8.5})
    payment('cloud-history','2026-03-31','2026-03-30',120,'HKD',{'EUR':1,'USD':1.09,'CNY':7.9,'HKD':8.5})
    payment('music-history','2026-07-01','2026-06-30',18,'CNY',{'EUR':1,'USD':1.1,'CNY':7.8,'HKD':8.6})
    payments.append({'id':'failed-history','subscriptionId':'music-history','name':'音乐会员',
                     'date':'2026-06-01','amount':18,'currency':'CNY','status':'failed',
                     'advancesSchedule':False})
    return {'subscriptions':subscriptions,'payments':payments,'costHistory':history}

def capture(folder):
    folder.mkdir(parents=True, exist_ok=True)
    with Harness() as h:
        for name, size in SIZES.items():
            page = h.page(size, FIXTURE, PREFS)
            for view in ['home', 'list', 'stats', 'calendar', 'settings']:
                page.locator(f'[data-nav={view}]').click()
                page.clock.run_for(350)
                page.screenshot(path=folder / f'{name}-{view}.png', full_page=True, animations='disabled')
            page.locator('[data-nav=home]').click()
            page.locator('[data-add]').click()
            page.clock.run_for(350)
            page.screenshot(path=folder / f'{name}-form.png', full_page=True, animations='disabled')
            page.locator('[data-close]').first.click()
            target=page.locator('.mobile-subscription').first if name=='phone' else page.locator('tr[data-detail]').first
            target.click()
            page.clock.run_for(350)
            page.screenshot(path=folder / f'{name}-detail.png', full_page=True, animations='disabled')
            page.locator('[data-payment]').click()
            page.clock.run_for(350)
            page.screenshot(path=folder / f'{name}-payment.png', full_page=True, animations='disabled')
            page.context.close()
        due=copy.deepcopy(FIXTURE)
        due['subscriptions'][0]['nextDate']='2026-10-21'
        due['subscriptions'][1]['nextDate']='2026-10-22'
        page=h.page(SIZES['phone'],due,PREFS)
        page.clock.run_for(350)
        page.screenshot(path=folder/'phone-reminders.png',full_page=True,animations='disabled')
        page.context.close()
        for name, size in SIZES.items():
            page=h.page(size,statistics_history_fixture(),PREFS)
            page.locator('[data-nav=stats]').click()
            page.locator('#statsMode').select_option('custom')
            page.locator('#statsStart').fill('2024-01-01')
            page.locator('#statsEnd').fill('2026-10-22')
            page.locator('#statsFilters [type=submit]').click()
            page.clock.run_for(350)
            assert page.locator('[data-chart=monthly] .stats-bar').count()>12
            assert page.locator('[data-chart=annual] .stats-bar').count()==3
            assert page.locator('.stats-payments .payment').count()==4
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=folder/f'{name}-stats-history.png',full_page=True,animations='disabled')
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
        if len(list(args.against.glob('*.png'))) != BASELINE_COUNT:
            raise SystemExit(f'Expected {BASELINE_COUNT} reviewed baselines')
        failures = compare(args.against, destination)
        print('\n'.join(failures) if failures else f'PASS: {BASELINE_COUNT} visual baselines')
        raise SystemExit(bool(failures))
    print(f'Captured {BASELINE_COUNT} screenshots in {destination}')
