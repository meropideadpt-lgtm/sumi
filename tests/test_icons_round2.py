"""Monochrome built-ins and unchanged custom images; Chromium, not real iPadOS."""
import base64
import copy
from io import BytesIO
import unittest

from PIL import Image
from playwright.sync_api import expect

from browser_support import Harness, FIXTURE, PREFS, SIZES


class ServiceIconRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages = []
        self.errors = []

    def tearDown(self):
        for page in self.pages:
            page.context.close()
        self.assertEqual(self.errors, [])

    def page(self, **kwargs):
        page = self.h.page(**kwargs)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.pages.append(page)
        return page

    def picker(self, page):
        page.locator('[data-nav=home]').click()
        page.locator('[data-add]').click()
        page.locator('#openPicker').click()
        page.wait_for_function("[...document.querySelectorAll('#pickerResults img')].every(image=>image.complete&&image.naturalWidth>0)")

    def test_every_builtin_decodes_as_black_geometry_with_transparency_and_distinct_shapes(self):
        page = self.page()
        pixels = page.evaluate('''async()=>{
            const result=[];
            for(const service of SumiCatalog.all.filter(item=>item.logo)){
                const image=new Image();image.src=service.logo;await image.decode();
                const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
                const ctx=canvas.getContext('2d');
                const ratio=Math.min(128/image.naturalWidth,128/image.naturalHeight);
                ctx.drawImage(image,0,0,image.naturalWidth*ratio,image.naturalHeight*ratio);
                const rgba=ctx.getImageData(0,0,128,128).data;
                let visible=0,transparent=0,colored=0;
                for(let i=0;i<rgba.length;i+=4){
                    if(rgba[i+3]===0)transparent++;
                    if(rgba[i+3]>0){visible++;if(rgba[i]||rgba[i+1]||rgba[i+2])colored++}
                }
                result.push({id:service.id,visible,transparent,colored,signature:canvas.toDataURL()});
            }
            return result;
        }''')
        self.assertEqual(len(pixels), 55)
        for icon in pixels:
            with self.subTest(icon=icon['id']):
                self.assertGreater(icon['visible'], 100, 'No blank mark')
                self.assertGreater(icon['transparent'], 1000, 'No opaque rectangular brand tile')
                self.assertEqual(icon['colored'], 0, 'Only black plus antialiased transparency')
        self.assertGreater(len({icon['signature'] for icon in pixels}), 50)

    def test_all_picker_marks_and_defaults_follow_light_dark_and_system(self):
        page = self.page(prefs={**PREFS, 'theme':'system'})
        self.picker(page)
        expect(page.locator('#pickerResults img.logo.builtin')).to_have_count(55)
        expect(page.locator('#pickerResults .logo.fallback')).to_have_count(17)
        for scheme in ['dark', 'light', 'dark']:
            with self.subTest(scheme=scheme):
                page.emulate_media(color_scheme=scheme)
                expect(page.locator('html')).to_have_attribute('data-theme', scheme)
                filters = page.locator('#pickerResults img.logo').evaluate_all('(images)=>images.map(image=>getComputedStyle(image).filter)')
                self.assertEqual(set(filters), {'brightness(0) invert(1)' if scheme=='dark' else 'brightness(0)'})
                backgrounds = page.locator('#pickerResults .logo').evaluate_all('(images)=>images.map(image=>getComputedStyle(image).backgroundColor)')
                self.assertEqual(set(backgrounds), {'rgba(0, 0, 0, 0)'})
                colors = page.locator('#pickerResults .fallback').evaluate_all('(nodes)=>nodes.map(node=>getComputedStyle(node).color)')
                self.assertEqual(set(colors), {'rgb(231, 236, 245)' if scheme=='dark' else 'rgb(24, 34, 56)'})

    def test_custom_image_colors_and_legacy_business_data_survive_theme_changes(self):
        buffer = BytesIO()
        Image.new('RGB', (8,8), '#ed3049').save(buffer, format='PNG')
        source = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
        data = copy.deepcopy(FIXTURE)
        data['subscriptions'][0]['logo'] = source
        data['subscriptions'][0]['customField'] = {'preserve':True}
        page = self.page(data=data, prefs={**PREFS, 'theme':'system'})
        raw = page.evaluate("localStorage.getItem('sumi-data-v1')")
        page.locator('[data-nav=list]').click()
        page.clock.run_for(350)
        image = page.locator('[data-detail=reading] img.logo')
        for theme in ['light','dark','light']:
            page.emulate_media(color_scheme=theme)
            expect(page.locator('html')).to_have_attribute('data-theme', theme)
            page.clock.run_for(350)
            expect(image).to_have_attribute('src', source)
            self.assertEqual(image.evaluate('node=>getComputedStyle(node).filter'), 'none')
            self.assertFalse(image.evaluate("node=>node.classList.contains('builtin')"))
            self.assertEqual(page.evaluate("localStorage.getItem('sumi-data-v1')"), raw)
            rendered=Image.open(BytesIO(image.screenshot(animations='disabled'))).convert('RGB')
            self.assertEqual(rendered.getpixel((rendered.width//2, rendered.height//2)), (237,48,73))
        page.reload()
        expect(page.locator('[data-detail=reading] img.logo').first).to_have_attribute('src', source)
        self.assertEqual(page.evaluate("localStorage.getItem('sumi-data-v1')"), raw)

    def test_failed_builtin_uses_accessible_app_grid_without_a_broken_image(self):
        data = copy.deepcopy(FIXTURE)
        data['subscriptions'][0].update(name='GitHub', logo='assets/brands/github.svg')
        page = self.page(data=data)
        page.route('**/assets/brands/github.svg', lambda route:route.abort())
        page.reload()
        page.locator('[data-nav=list]').click()
        fallback = page.locator('[data-detail=reading] .logo.fallback')
        expect(fallback).to_have_count(1)
        expect(fallback).to_have_attribute('role', 'img')
        expect(fallback).to_have_attribute('aria-label', 'GitHub：暂无图标')
        expect(fallback.locator('svg rect')).to_have_count(4)
        expect(page.locator('[data-detail=reading] img')).to_have_count(0)
        self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1')).subscriptions[0].logo"), 'assets/brands/github.svg')

    def test_builtin_style_is_shared_by_search_form_list_details_and_statistics_at_all_sizes(self):
        for name, size in SIZES.items():
            with self.subTest(viewport=name):
                data = copy.deepcopy(FIXTURE)
                data['subscriptions'][0].update(name='GitHub', logo='https://cdn.simpleicons.org/github')
                page = self.page(size=size, data=data, prefs={**PREFS,'theme':'dark'})
                raw=page.evaluate("localStorage.getItem('sumi-data-v1')")
                page.locator('[data-add]').click()
                page.locator('#name').fill('GitHub')
                suggestion=page.locator('[data-suggest=github] img.builtin')
                expect(suggestion).to_have_attribute('src','assets/brands/github.svg')
                page.locator('[data-suggest=github]').click()
                expect(page.locator('#openPicker img.builtin')).to_have_count(1)
                page.locator('[data-close]').first.click()
                page.clock.run_for(350)
                page.locator('[data-nav=list]').click()
                logo=page.locator('[data-detail=reading] img.builtin')
                expect(logo).to_have_count(1)
                logo.click()
                expect(page.locator('.detail-hero img.builtin')).to_have_count(1)
                page.locator('[data-edit]').click()
                expect(page.locator('#openPicker img.builtin')).to_have_count(1)
                page.locator('[data-close]').first.click()
                page.clock.run_for(350)
                page.locator('[data-nav=stats]').click()
                expect(page.locator('[data-shares=service] img.builtin')).to_have_count(1)
                self.assertEqual(page.locator('[data-shares=service] img.builtin').evaluate('node=>getComputedStyle(node).filter'),'brightness(0) invert(1)')
                self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                self.assertEqual(page.evaluate("localStorage.getItem('sumi-data-v1')"),raw)
