#!/usr/bin/env python3
# 账号 v1.1 前端冒烟：本地 wrangler dev 后端 (ACCOUNT_TEST_CHANNEL=1) + www 副本 (API 改指本地)。
# 浏览器对 127.0.0.1:8791 的请求由 Playwright route 拦截、经 Python urllib 实发（绕沙箱 Chromium 回环拦截）。
# 取码只走双门测试通道 (x-admin-secret)、只发合成测试邮箱 *@wuri-test.local，绝不打生产、绝不用真实邮箱。
import json, sys, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

API = 'http://127.0.0.1:8791'
ADMIN = 'localtest'
WWW = 'file:///home/hatch/workspace/.stage-acctv11/index.html'
OUT = '/tmp/acctv11-shots'
import os
os.makedirs(OUT, exist_ok=True)

SFX = str(int(time.time()))[-6:]
U1 = 'fe_' + SFX + 'a'
U2 = 'fe_' + SFX + 'b'
EM = f'qa-{SFX}@wuri-test.local'
results = []
def chk(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('  PASS ' if cond else '  FAIL ') + name + ((' :: ' + str(extra)[:200]) if not cond else ''))

_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def http(method, path, body=None, headers=None):
    req = urllib.request.Request(API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with _opener.open(req) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def get_code(email):
    for attempt in range(5):
        st, b = http('POST', '/api/auth/request-code', {'email': email}, {'x-admin-secret': ADMIN})
        if b.get('devCode'):
            return b['devCode']
        if b.get('error') == 'rate_limited' and attempt < 4:
            time.sleep(20)  # 撞邮箱重发冷却（本地 dev 限流与生产同口径），等下一窗口
            continue
        raise AssertionError(f'no devCode: {st} {b}')

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 412, 'height': 880})
        errors = []
        page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        def proxy(route):
            req = route.request
            try:
                st, b = http(req.method, req.url[len(API):], req.post_data_json if req.post_data else None,
                             {k: v for k, v in req.headers.items() if k.lower() in ('authorization', 'x-photo-uuid', 'content-type')})
                print('  [proxy]', req.method, req.url[len(API):], '->', st)
                if st == 204:
                    route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Photo-Uuid', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'})
                else:
                    route.fulfill(status=st, content_type='application/json', body=json.dumps(b),
                                  headers={'Access-Control-Allow-Origin': '*'})
            except Exception as e:
                print('  [proxy-error]', req.method, req.url, e)
                route.fulfill(status=502, content_type='application/json', body=json.dumps({'ok': False, 'error': 'proxy', 'message': str(e)}))
        page.route(API + '/**', proxy)

        def dismiss_explainer():
            page.wait_for_timeout(700)
            if page.is_visible('#view-account-sync'):
                page.click('#acct-sync-cancel')
                page.wait_for_timeout(400)

        page.goto(WWW)
        page.wait_for_timeout(1500)
        page.click('[data-tab="tab-me"]')
        page.wait_for_selector('#acct-card:not([hidden])', timeout=15000)
        chk('账号卡可见（后端开关开）', True)

        # ---------- 1. 用户名注册（跳过邮箱） ----------
        page.click('#acct-login-open')
        page.wait_for_selector('#view-account-login:not([hidden])')
        page.screenshot(path=f'{OUT}/01-login-email-tab.png')
        page.click('#acct-tab-user')
        page.click('#acct-to-register')
        page.fill('#acct-r-uname', U1)
        page.fill('#acct-r-pass1', 'smoke-pass-123')
        page.fill('#acct-r-pass2', 'smoke-pass-123')
        page.click('#acct-do-register')
        page.wait_for_function("document.getElementById('view-account-login').hidden === true", timeout=10000)
        dismiss_explainer()
        page.wait_for_selector('#acct-in:not([hidden])', timeout=10000)
        chk('注册后自动登录', True)
        chk('账号卡显示用户名', page.inner_text('#acct-username') == U1)
        chk('无邮箱时邮箱行隐藏', page.is_hidden('#acct-email-row'))
        owner1 = page.evaluate("localStorage.getItem('wuri_acct_owner_v1')")
        chk('owner 键为 user: 形态', owner1 == 'user:' + U1, owner1)

        # ---------- 2. 登录方式页 + 加绑邮箱 ----------
        page.click('#acct-security-open')
        page.wait_for_selector('#view-account-security:not([hidden])')
        page.wait_for_function("document.getElementById('acct-sec-bindemail').hidden === false", timeout=8000)
        chk('安全页：加绑邮箱区可见、加绑用户名区隐藏', page.is_hidden('#acct-sec-binduser'))
        page.screenshot(path=f'{OUT}/02-security.png')
        page.fill('#acct-e-email', EM)
        code = get_code(EM)
        page.fill('#acct-e-code', code)
        page.click('#acct-e-do')
        page.wait_for_function(f"document.getElementById('acct-sec-email').textContent.includes('{EM}')", timeout=8000)
        chk('加绑邮箱成功、安全页邮箱完整显示', True)
        chk('账号卡邮箱完整显示（不打码）', page.evaluate("document.getElementById('acct-email-mask').textContent") == EM)
        page.click('#acct-sec-back')

        # ---------- 3. 退出 → 错密 → 用户名重登 ----------
        page.click('#acct-logout')
        page.wait_for_selector('#acct-out:not([hidden])')
        page.click('#acct-login-open')
        page.click('#acct-tab-user')
        page.fill('#acct-uname', U1)
        page.fill('#acct-upass', 'wrong-wrong-1')
        page.click('#acct-do-login-user')
        page.wait_for_function("document.getElementById('acct-user-msg').textContent.length > 0", timeout=8000)
        chk('错密通用文案', page.inner_text('#acct-user-msg') == '用户名或密码不正确', page.inner_text('#acct-user-msg'))
        page.fill('#acct-upass', 'smoke-pass-123')
        page.click('#acct-do-login-user')
        page.wait_for_function("document.getElementById('view-account-login').hidden === true", timeout=10000)
        dismiss_explainer()
        page.wait_for_selector('#acct-in:not([hidden])', timeout=10000)
        chk('用户名重登成功', True)
        owner2 = page.evaluate("localStorage.getItem('wuri_acct_owner_v1')")
        chk('绑邮箱后 owner 收敛为邮箱（同一账号）', owner2 == EM, owner2)

        # ---------- 4. 服务端同一份数据（双路令牌互通） ----------
        tok_u = page.evaluate("localStorage.getItem('wuri_acct_token_v1')")
        st, push = http('POST', '/api/sync/push', {'items': [{'dataset': 'ls', 'key': 'wuri_jing_font', 'value': '20', 'updated_at': '2026-10-27T10:00:00.000Z'}]}, {'Authorization': 'Bearer ' + tok_u})
        chk('用户名会话 push 成功', st == 200 and push.get('ok'), f'{st} {push}')
        code2 = get_code(EM)
        st, vfy = http('POST', '/api/auth/verify', {'email': EM, 'code': code2, 'label': 'smoke'})
        chk('邮箱路登录同一账号', st == 200 and vfy.get('username') == U1, f'{st} {vfy}')
        st, pull = http('POST', '/api/sync/pull', {'stamps': {}}, {'Authorization': 'Bearer ' + vfy['token']})
        items = pull.get('items') or []
        chk('邮箱会话 pull 到同一份数据', any(i.get('key') == 'wuri_jing_font' for i in items), f'{st} {len(items)} items')

        # ---------- 5. 改密（旧密码） ----------
        page.click('#acct-security-open')
        page.wait_for_selector('#view-account-security:not([hidden])')
        page.fill('#acct-c-old', 'smoke-pass-123')
        page.fill('#acct-c-new', 'smoke-pass-456')
        page.click('#acct-c-do')
        page.wait_for_selector('#wuri-ai-toast', state='visible', timeout=8000)
        chk('改密成功 toast', '密码已修改' in page.inner_text('#wuri-ai-toast'), page.inner_text('#wuri-ai-toast'))
        page.click('#acct-sec-back')
        page.click('#acct-logout')
        page.wait_for_selector('#acct-out:not([hidden])')
        st, old = http('POST', '/api/auth/login-username', {'username': U1, 'password': 'smoke-pass-123'})
        chk('旧密码失效', st == 401, st)
        st, new = http('POST', '/api/auth/login-username', {'username': U1, 'password': 'smoke-pass-456'})
        chk('新密码可登', st == 200 and bool(new.get('token')), st)

        # ---------- 6. 忘记密码（邮箱验证码重置） ----------
        page.click('#acct-login-open')
        page.click('#acct-tab-user')
        page.click('#acct-to-forgot')
        page.fill('#acct-f-email', EM)
        code3 = get_code(EM)
        page.fill('#acct-f-code', code3)
        page.fill('#acct-f-pass', 'smoke-pass-789')
        page.click('#acct-do-reset')
        page.wait_for_function("document.getElementById('acct-user-msg').textContent.includes('已重置')", timeout=8000)
        chk('重置后回登录态并提示', True)
        page.screenshot(path=f'{OUT}/03-forgot-done.png')
        page.fill('#acct-uname', U1)
        page.fill('#acct-upass', 'smoke-pass-789')
        page.click('#acct-do-login-user')
        page.wait_for_function("document.getElementById('view-account-login').hidden === true", timeout=10000)
        dismiss_explainer()
        page.wait_for_selector('#acct-in:not([hidden])', timeout=10000)
        chk('重置密码可登录', True)

        # ---------- 7. 邮箱验证码老路径回归 ----------
        page.click('#acct-logout')
        page.wait_for_selector('#acct-out:not([hidden])')
        page.click('#acct-login-open')
        page.click('#acct-tab-email')
        page.fill('#acct-email', EM)
        code4 = get_code(EM)
        page.fill('#acct-code', code4)
        page.click('#acct-do-login')
        page.wait_for_function("document.getElementById('view-account-login').hidden === true", timeout=10000)
        dismiss_explainer()
        page.wait_for_selector('#acct-in:not([hidden])', timeout=10000)
        chk('邮箱验证码老路径登录成功', True)
        chk('双身份同卡共存', page.inner_text('#acct-username') == U1 and page.inner_text('#acct-email-mask') == EM)

        # ---------- 8. 纯用户名账号删号（密码+打字） ----------
        page.click('#acct-logout')
        page.wait_for_selector('#acct-out:not([hidden])')
        st, reg2 = http('POST', '/api/auth/register-username', {'username': U2, 'password': 'smoke2-pass-123', 'label': 'smoke'})
        page.evaluate("""([tok, un]) => {
          localStorage.setItem('wuri_acct_token_v1', tok);
          localStorage.setItem('wuri_acct_username_v1', un);
          localStorage.setItem('wuri_acct_haspw_v1', '1');
          localStorage.setItem('wuri_acct_owner_v1', 'user:' + un);
        }""", [reg2['token'], U2])
        page.reload()
        page.wait_for_timeout(1200)
        page.click('[data-tab="tab-me"]')
        page.wait_for_function("document.getElementById('acct-in').hidden === false", timeout=10000)
        page.click('#acct-delete-open')
        page.wait_for_selector('#view-account-delete:not([hidden])')
        page.wait_for_function("document.getElementById('acct-del-pw-mode').hidden === false", timeout=8000)
        chk('纯用户名账号删号为密码模式（邮箱模式隐藏）', page.is_hidden('#acct-del-email-mode'))
        page.screenshot(path=f'{OUT}/04-delete-pw.png')
        page.fill('#acct-del-pass', 'smoke2-pass-123')
        page.fill('#acct-del-confirm', '删')
        page.click('#acct-del-pw-btn')
        page.wait_for_function("document.getElementById('acct-del-pw-msg').textContent.length > 0", timeout=8000)
        chk('确认字不对先拦截', page.inner_text('#acct-del-pw-msg') == '请输入「删除」二字确认', page.inner_text('#acct-del-pw-msg'))
        page.fill('#acct-del-confirm', '删除')
        page.click('#acct-del-pw-btn')
        page.wait_for_selector('#acct-out:not([hidden])', timeout=10000)
        chk('删号后回到未登录', True)
        st, gone = http('POST', '/api/auth/login-username', {'username': U2, 'password': 'smoke2-pass-123'})
        chk('删后不可登录', st == 401, st)

        # ---------- 9. 红光模式登录页 ----------
        page.evaluate("localStorage.setItem('wuri_sky_redlight_v1', '1')")
        page.reload()
        page.wait_for_timeout(1200)
        page.click('[data-tab="tab-me"]')
        page.wait_for_selector('#acct-card:not([hidden])', timeout=15000)
        page.click('#acct-login-open')
        page.click('#acct-tab-user')
        page.screenshot(path=f'{OUT}/05-login-redlight.png')
        chk('红光 body 类生效', page.evaluate("document.body.classList.contains('sky-red')"))

        # 只计未捕获 JS 异常；资源级 401/404 控制台噪声（会话失效后权益刷新等预期路径）与 file:// 环境 feed 拉取报错不计
        real_errors = [e for e in errors if e.startswith('PAGEERROR:')]
        chk('零 JS 异常（未捕获异常口径）', len(real_errors) == 0, ' | '.join(real_errors[:5]))
        browser.close()
    fails = [n for n, ok in results if not ok]
    print(f'==== frontend smoke: {len(results) - len(fails)}/{len(results)} passed ====')
    sys.exit(1 if fails else 0)

run()
