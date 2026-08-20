// DSH 小鲸鱼余额挂件 —— 独立版渲染进程脚本
// 视觉与交互继承 DSH 插件版；数据经 preload 的 whaleAPI 走主进程。
(function () {
  'use strict'
  if (window.__dshWhaleStandalone) return
  window.__dshWhaleStandalone = true

  var API = window.whaleAPI
  if (!API) return

  var MIN_SCALE = 0.6
  var MAX_SCALE = 1.4
  var STEP = 0.1
  var CLICK_SQ = 9
  var REFRESH_MS = 60000
  var CHANGE_MS = 900
  var ANIM_MS = 700

  var css = [
    '.dshwv-root{position:fixed;left:0;top:0;width:100%;height:100%;--dshw-scale:1;--dshw-base:calc(196px * var(--dshw-scale));cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;overflow:hidden}',
    '.dshwv-root.dshwv-left{transform:scaleX(-1)}',
    '.dshwv-root.dshwv-dragging{cursor:grabbing}',
    '.dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}',
    '.dshwv-img{width:var(--dshw-base);height:var(--dshw-base);display:block;pointer-events:none;-webkit-user-drag:none;user-select:none}',
    '.dshwv-text{position:absolute;left:44.346%;top:25.5%;transform:translate(-50%,-50%);text-align:center;color:#536ba9;line-height:1.18;white-space:nowrap;--dshw-u:calc(var(--dshw-base) / 1026);pointer-events:none;transition:transform .3s ease}',
    '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
    '.dshwv-label{font-size:calc(var(--dshw-u) * 68);font-weight:600;letter-spacing:.06em}',
    '.dshwv-amount{font-size:calc(var(--dshw-u) * 119);font-weight:800;line-height:1.05}',
    '.dshwv-hint{font-size:calc(var(--dshw-u) * 54);color:#9fb0d9;letter-spacing:.02em}',
    '.dshwv-size{position:absolute;top:4px;right:4px;display:flex;gap:4px;opacity:0;transition:opacity .15s ease;z-index:2}',
    '.dshwv-root:hover .dshwv-size{opacity:1}',
    '.dshwv-size button{width:20px;height:20px;border:none;border-radius:50%;background:rgba(83,107,169,.85);color:#fff;font-size:13px;line-height:1;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none}',
    '.dshwv-size button:hover{background:#536ba9}',
    '.dshwv-setup{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,.96);border-radius:24px;box-sizing:border-box;padding:14px}',
    '.dshwv-setup .t{font-size:13px;font-weight:700;color:#536ba9}',
    '.dshwv-setup .d{font-size:10px;color:#9fb0d9;text-align:center;line-height:1.4}',
    '.dshwv-setup input{width:100%;box-sizing:border-box;padding:6px 8px;font-size:11px;border:1px solid #c8d2ee;border-radius:8px;outline:none;color:#333}',
    '.dshwv-setup input:focus{border-color:#536ba9}',
    '.dshwv-setup button{padding:5px 18px;font-size:12px;font-weight:600;color:#fff;background:#536ba9;border:none;border-radius:12px;cursor:pointer}',
    '.dshwv-setup button:hover{background:#42599a}',
    '.dshwv-setup .err{font-size:10px;color:#d9534f;min-height:12px}'
  ].join('\n')

  var styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)

  var root = document.createElement('div')
  root.className = 'dshwv-root'

  var img = document.createElement('img')
  img.className = 'dshwv-img'
  img.src = 'assets/DSniang02.png'
  img.alt = 'DeepSeek 余额'
  img.draggable = false

  var sizeBox = document.createElement('div')
  sizeBox.className = 'dshwv-size'
  function makeBtn(text, title, delta) {
    var b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.title = title
    b.addEventListener('pointerdown', function (e) { e.stopPropagation() })
    b.addEventListener('click', function (e) { e.stopPropagation(); adjust(delta) })
    return b
  }
  sizeBox.appendChild(makeBtn('-', '缩小', -STEP))
  sizeBox.appendChild(makeBtn('+', '放大', STEP))

  var textBox = document.createElement('div')
  textBox.className = 'dshwv-text'
  var labelEl = document.createElement('div')
  labelEl.className = 'dshwv-label'
  labelEl.textContent = 'DeepSeek 余额'
  var amountEl = document.createElement('div')
  amountEl.className = 'dshwv-amount'
  var hintEl = document.createElement('div')
  hintEl.className = 'dshwv-hint'
  textBox.appendChild(labelEl)
  textBox.appendChild(amountEl)
  textBox.appendChild(hintEl)

  var body = document.createElement('div')
  body.className = 'dshwv-body'
  body.appendChild(img)
  body.appendChild(sizeBox)
  body.appendChild(textBox)
  root.appendChild(body)
  document.body.appendChild(root)

  // 首次配置 API Key 的卡片
  var setup = document.createElement('div')
  setup.className = 'dshwv-setup'
  setup.style.display = 'none'
  var tEl = document.createElement('div'); tEl.className = 't'; tEl.textContent = '配置 DeepSeek API Key'
  var dEl = document.createElement('div'); dEl.className = 'd'
  dEl.textContent = '在 platform.deepseek.com 创建 API Key，粘贴后即可显示余额'
  var inputEl = document.createElement('input')
  inputEl.type = 'password'
  inputEl.placeholder = 'sk-...'
  var errEl = document.createElement('div'); errEl.className = 'err'
  var saveBtn = document.createElement('button')
  saveBtn.textContent = '保存'
  setup.appendChild(tEl)
  setup.appendChild(dEl)
  setup.appendChild(inputEl)
  setup.appendChild(errEl)
  setup.appendChild(saveBtn)
  root.appendChild(setup)

  var state = {
    scale: 1,
    h: 'right',
    v: 'bottom',
    balance: null,
    currency: null,
    usage: null,
    mode: 'balance',
    status: 'loading',
    message: '',
    keyConfigured: false
  }
  var busy = false
  var drag = null
  var shown = null
  var animId = null

  function fmt(balance, currency) {
    var num = Number(balance)
    var fixed = isFinite(num) ? num.toFixed(2) : '--'
    return currency === 'CNY' ? '¥ ' + fixed : fixed + ' ' + currency
  }
  function animateAmount(from, to, currency, duration) {
    if (animId) cancelAnimationFrame(animId)
    if (from === null || !isFinite(from)) from = to
    if (from === to) {
      shown = to
      amountEl.textContent = fmt(to, currency)
      return
    }
    var startTime = null
    function step(ts) {
      if (startTime === null) startTime = ts
      var t = Math.min(1, (ts - startTime) / duration)
      var eased = 1 - Math.pow(1 - t, 3)
      var val = from + (to - from) * eased
      amountEl.textContent = fmt(val, currency)
      if (t < 1) {
        animId = requestAnimationFrame(step)
      } else {
        animId = null
        shown = to
        amountEl.textContent = fmt(to, currency)
      }
    }
    animId = requestAnimationFrame(step)
  }
  function displayValue() {
    return state.mode === 'usage' ? state.usage : state.balance
  }
  function render() {
    labelEl.textContent = state.mode === 'usage' ? '今日消耗' : 'DeepSeek 余额'
    var amount, hint
    var dv = displayValue()
    if (state.status === 'loading') {
      amount = shown !== null ? fmt(shown, state.currency) : '…'
      hint = '加载中…'
    } else if (state.status === 'error') {
      amount = shown !== null ? fmt(shown, state.currency) : '--'
      hint = state.message ? state.message.slice(0, 14) : '获取失败'
    } else {
      amount = shown !== null ? fmt(shown, state.currency) : (dv !== null ? fmt(dv, state.currency) : '--')
      hint = state.status === 'changing' ? '加载中…' : (state.mode === 'usage' ? '点击查看余额' : '点击查看消耗')
    }
    amountEl.textContent = amount
    hintEl.textContent = hint
  }
  function switchMode() {
    state.mode = state.mode === 'usage' ? 'balance' : 'usage'
    var target = displayValue()
    if (shown !== null && target !== null && target !== shown) animateAmount(shown, target, state.currency, ANIM_MS)
    render()
  }
  function applyPayload(p) {
    if (!p) return
    if (p.ok) {
      var nb = Number(p.totalBalance)
      var nc = String(p.currency || 'CNY')
      var nu = (p.todayUsage && isFinite(Number(p.todayUsage.amount))) ? Number(p.todayUsage.amount) : null
      var currencyChanged = state.currency !== null && nc !== state.currency
      state.balance = nb
      state.currency = nc
      if (nu !== null) state.usage = nu
      state.message = ''
      var target = displayValue()
      var changed = state.balance !== null && target !== null && target !== shown
      if (changed && !currencyChanged) {
        state.status = 'changing'
        animateAmount(shown, target, nc, ANIM_MS)
        setTimeout(function () {
          if (state.status === 'changing') { state.status = 'ok'; render() }
        }, CHANGE_MS)
      } else {
        if (animId === null) shown = target
        state.status = 'ok'
        render()
      }
    } else {
      state.status = 'error'
      state.message = (p && p.error) ? String(p.error) : '获取失败'
      render()
    }
  }
  function refresh() {
    if (busy) return
    busy = true
    API.refresh()
      .then(function (p) {
        state.keyConfigured = !!(p && p.keyConfigured)
        if (!state.keyConfigured) {
          state.status = 'error'
          state.message = ''
          render()
          setup.style.display = 'flex'
          return
        }
        setup.style.display = 'none'
        applyPayload(p)
      })
      .catch(function () {
        state.status = 'error'
        state.message = '获取失败'
        render()
      })
      .finally(function () { busy = false })
  }
  function adjust(delta) {
    var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale + delta)) * 10) / 10
    state.scale = next
    root.style.setProperty('--dshw-scale', String(next))
    API.setScale(next, state.h, state.v)
  }

  var SQUISH = 'scaleY(0.88) scaleX(1.05)'
  function pressDown() { body.style.transform = SQUISH }
  function pressUp() { body.style.transform = 'scaleY(1) scaleX(1)' }

  function onPointerDown(e) {
    if (e.button !== 0) return
    try { root.setPointerCapture(e.pointerId) } catch (err) {}
    drag = { active: true, startX: e.clientX, startY: e.clientY, moved: false }
    root.classList.add('dshwv-dragging')
    pressDown()
    API.dragStart()
  }
  function onPointerMove(e) {
    if (!drag || !drag.active) return
    var dx = e.clientX - drag.startX
    var dy = e.clientY - drag.startY
    if (dx * dx + dy * dy >= CLICK_SQ) {
      drag.moved = true
      API.dragMove()
    }
  }
  function onPointerUp(e) {
    if (!drag || !drag.active) return
    drag.active = false
    pressUp()
    root.classList.remove('dshwv-dragging')
    try {
      if (root.hasPointerCapture && root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
    } catch (err) {}
    if (!drag.moved) switchMode()
    API.dragEnd()
  }

  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('pointermove', onPointerMove)
  root.addEventListener('pointerup', onPointerUp)
  root.addEventListener('pointercancel', onPointerUp)

  API.onSnap(function (s) {
    if (s && (s.h === 'left' || s.h === 'right' || s.h === null)) state.h = s.h
    if (s && (s.v === 'top' || s.v === 'bottom' || s.v === null)) state.v = s.v
    root.classList.toggle('dshwv-left', state.h === 'left')
  })

  saveBtn.addEventListener('click', function () {
    var key = inputEl.value.trim()
    if (!key) { errEl.textContent = '请粘贴 API Key'; return }
    errEl.textContent = '保存中…'
    API.setKey(key).then(function (r) {
      if (r && r.ok) {
        errEl.textContent = ''
        inputEl.value = ''
        state.keyConfigured = true
        refresh()
      } else {
        errEl.textContent = (r && r.error) ? r.error : '保存失败'
      }
    })
  })
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveBtn.click() })

  // 初始化：恢复尺寸并加载状态
  API.getStatus().then(function (p) {
    state.keyConfigured = !!(p && p.keyConfigured)
    if (!state.keyConfigured) {
      state.status = 'error'
      render()
      setup.style.display = 'flex'
      return
    }
    applyPayload(p)
  })
  setInterval(refresh, REFRESH_MS)
})()
