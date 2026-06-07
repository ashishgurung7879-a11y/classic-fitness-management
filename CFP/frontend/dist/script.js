// ===================================
// CLASSIC FITNESS PARK - SCRIPT
// Connected to Backend API
// ===================================

const API_URL = window.CFPAppConfig.getApiBaseUrl();

// ── API Helper ──────────────────────────────
async function api(endpoint, options = {}) {
  const token = localStorage.getItem('cfp_token');
  const config = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(API_URL + endpoint, config);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, data: { message: 'Cannot connect to server. Make sure backend is running on port 5000.' } };
  }
}

const initialProductsGrid = document.getElementById('productsGrid');
if (initialProductsGrid) initialProductsGrid.innerHTML = '';

// ── Loader ──────────────────────────────────
window.addEventListener('load', () => {
  setTimeout(async () => {
    document.getElementById('loader').classList.add('hidden');
    await loadPublicStats();
    initAnimations();
    loadProductsFromAPI();
    loadNotices();
    updateNavForLoggedInUser();
  }, 1000); // reduced timeout so it loads faster
});

async function loadNotices() {
  const { ok, data } = await api('/notices');
  const board = document.getElementById('noticeBoard');
  if (!board) return;
  if (ok && data.notices && data.notices.length > 0) {
    board.innerHTML = data.notices.map(n => `
      <div style="background:var(--dark2);border-left:4px solid var(--gold);border-radius:10px;padding:1.2rem 1.5rem;display:flex;align-items:center;gap:1rem;margin-bottom:0.8rem">
        <div style="font-size:2rem">${n.icon || '📢'}</div>
        <div>
          <div style="font-family:'Bebas Neue';font-size:1.1rem;color:var(--gold)">${n.title}</div>
          <div style="font-size:0.85rem;color:var(--gray-light)">${n.content}</div>
        </div>
      </div>
    `).join('');
  }
}

// ── Navbar ───────────────────────────────────
// ── Navbar & Scroll───────────────────────
const navbar = document.getElementById('navbar');
const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
  
  if (backToTop) {
    if (window.scrollY > 500) backToTop.classList.add('show');
    else backToTop.classList.remove('show');
  }
  
  updateActiveNav();
});
const hamburgerBtn = document.getElementById('hamburger');
const mobileMenuEl = document.getElementById('mobileMenu');
if(hamburgerBtn) {
  hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('open');
    if(mobileMenuEl) mobileMenuEl.classList.toggle('open');
    document.getElementById('navLinks')?.classList.toggle('open');
    document.body.style.overflow = mobileMenuEl?.classList.contains('open') ? 'hidden' : '';
  });
}
function closeMobileMenu() {
  if(hamburgerBtn) hamburgerBtn.classList.remove('open');
  if(mobileMenuEl) mobileMenuEl.classList.remove('open');
  document.getElementById('navLinks')?.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('click', (e) => {
  if(mobileMenuEl?.classList.contains('open') &&
     !e.target.closest('.mobile-menu') && !e.target.closest('.hamburger')) {
    closeMobileMenu();
  }
});
function updateActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const scrollY = window.scrollY + 100;
  sections.forEach(s => {
    const id = s.getAttribute('id');
    const link = document.querySelector(`.nav-link[href="#${id}"]`);
    if (link) {
      if (scrollY >= s.offsetTop && scrollY < s.offsetTop + s.offsetHeight) link.classList.add('active');
      else link.classList.remove('active');
    }
  });
}

// ── Logged-in user in nav ───────────────────
function updateNavForLoggedInUser() {
  const user = JSON.parse(localStorage.getItem('cfp_user') || 'null');
  const actions = document.querySelector('.nav-actions');
  if (!actions) return;
  if (user) {
    actions.innerHTML = `
      <span style="color:var(--gold);font-size:0.82rem;font-weight:700">👋 ${user.firstName}</span>
      <a href="member.html" class="btn-outline">Dashboard</a>
      <button class="btn-gold" onclick="logoutUser()">Logout</button>`;
  }
}
function logoutUser() {
  localStorage.removeItem('cfp_token');
  localStorage.removeItem('cfp_user');
  showToast('👋 Logged out');
  setTimeout(() => location.reload(), 1000);
}

// ── Particles ───────────────────────────────
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;width:${Math.random()*3+1}px;height:${Math.random()*3+1}px;animation-duration:${Math.random()*15+8}s;animation-delay:${Math.random()*8}s;`;
    container.appendChild(p);
  }
}
createParticles();

// ── Counter ──────────────────────────────────
async function loadPublicStats() {
  const { ok, data } = await api('/dashboard/public');
  if (ok && data.stats) {
    const memEl = document.getElementById('memberCountStat');
    const trEl = document.getElementById('trainerCountStat');
    if (memEl && data.stats.members !== undefined) memEl.dataset.count = data.stats.members;
    if (trEl && data.stats.trainers !== undefined) trEl.dataset.count = data.stats.trainers;
    
    // Dynamic Years Strong calculation (opened 2019)
    const yearsEl = document.getElementById('yearsCountStat');
    if (yearsEl) yearsEl.dataset.count = new Date().getFullYear() - 2019;
  }
}

function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.count);
    const step = target / (2000 / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(timer); }
      el.textContent = Math.floor(current).toLocaleString();
    }, 16);
  });
}
function initAnimations(){
  const observer=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('visible');
        if(e.target.classList.contains('hero-stats'))animateCounters();
      }
    });
  },{threshold:0.15});
  document.querySelectorAll('.stat,.about-grid,.class-card,.plan-card,.trainer-card,.product-card,.product-card-3d,.qr-card,.testimonial-card').forEach(el=>observer.observe(el));
  const hs=document.querySelector('.hero-stats');if(hs)observer.observe(hs);
}

// ── QR CODE DOWNLOAD ─────────────────────────
function downloadQRCode(imgId,filename){
  const img=document.getElementById(imgId);
  if(!img||!img.src){showToast('⚠️ QR not loaded');return;}
  const canvas=document.createElement('canvas');
  canvas.width=400;canvas.height=460;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,400,460);
  const tempImg=new Image();
  tempImg.crossOrigin='anonymous';
  tempImg.onload=function(){
    ctx.drawImage(tempImg,20,10,360,360);
    ctx.fillStyle='#CC0000';ctx.font='bold 18px Arial';ctx.textAlign='center';
    ctx.fillText('Classic Fitness Park',200,395);
    ctx.fillStyle='#666';ctx.font='13px Arial';
    ctx.fillText('Kakarvitta, Jhapa, Nepal',200,420);
    ctx.fillText('classicfitnesspark.com.np',200,442);
    const a=document.createElement('a');
    a.download=filename+'.png';a.href=canvas.toDataURL('image/png');a.click();
    showToast('✅ QR downloaded!');
  };
  tempImg.onerror=function(){
    const a=document.createElement('a');a.href=img.src;a.download=filename+'.png';a.target='_blank';a.click();
    showToast('✅ QR downloaded!');
  };
  tempImg.src=img.src;
}

// ── DEFAULT PRODUCTS ─────────────────────────
const DEFAULT_PRODUCTS = [
  {_id:'p1',name:'Whey Protein Gold',category:'protein',emoji:'🥛',description:'2kg • 25g protein per serving',price:4200,salePrice:3500,badge:'best',rating:{avg:5,count:124},stock:15},
  {_id:'p2',name:'Mass Gainer Pro',category:'protein',emoji:'💪',description:'3kg • 1200 kcal per serving',price:5500,salePrice:4800,badge:'new',rating:{avg:4,count:87},stock:8},
  {_id:'p3',name:'BCAA Recovery',category:'vitamins',emoji:'⚡',description:'300g • Tropical flavor',price:2800,salePrice:2200,badge:'hot',rating:{avg:5,count:98},stock:20},
  {_id:'p4',name:'Creatine Monohydrate',category:'vitamins',emoji:'🔬',description:'500g • Increases strength',price:1800,salePrice:null,badge:'',rating:{avg:4,count:65},stock:12},
  {_id:'p5',name:'Lifting Gloves Pro',category:'gear',emoji:'🧤',description:'Anti-slip • Full wrist support',price:850,salePrice:null,badge:'',rating:{avg:5,count:56},stock:25},
  {_id:'p6',name:'Resistance Bands Set',category:'gear',emoji:'🎽',description:'5 resistance levels • Premium latex',price:1200,salePrice:null,badge:'',rating:{avg:4,count:43},stock:18},
  {_id:'p7',name:'Gym Bag Pro',category:'gear',emoji:'🎒',description:'Large capacity • Waterproof',price:2500,salePrice:1999,badge:'sale',rating:{avg:4,count:31},stock:6},
  {_id:'p8',name:'CFP Training Tee',category:'apparel',emoji:'👕',description:'Dri-fit • CFP logo • S-XXL',price:950,salePrice:null,badge:'',rating:{avg:4,count:34},stock:30},
  {_id:'p9',name:'Pre-Workout Energy',category:'drinks',emoji:'🥤',description:'300g • Fruit punch • 200mg caffeine',price:3200,salePrice:2800,badge:'hot',rating:{avg:5,count:77},stock:10},
  {_id:'p10',name:'Protein Shaker Bottle',category:'gear',emoji:'🍶',description:'700ml • Leak proof • BPA free',price:650,salePrice:null,badge:'new',rating:{avg:4,count:22},stock:40},
  {_id:'p11',name:'Weight Belt',category:'gear',emoji:'🏋️',description:'Genuine leather • Adjustable',price:1800,salePrice:1500,badge:'sale',rating:{avg:5,count:19},stock:7},
  {_id:'p12',name:'Multivitamin Pack',category:'vitamins',emoji:'💊',description:'30 day supply • 23 vitamins',price:1200,salePrice:null,badge:'',rating:{avg:4,count:45},stock:22},
];
let _allProducts=[],_wishlist=JSON.parse(localStorage.getItem('cfp_wishlist')||'[]'),_currentCat='all';

function renderStars(avg){const f=Math.floor(avg);return '★'.repeat(f)+'☆'.repeat(5-f);}
function getBadgeClass(b){return {hot:'hot',new:'new',sale:'sale',best:'best',BESTSELLER:'best',HOT:'hot',NEW:'new',SALE:'sale'}[b]||'hot';}

function setShopEmptyMessage(message){
  const empty=document.getElementById('shopEmpty');
  if(empty)empty.textContent=message;
}

function renderProducts(products){
  const grid=document.getElementById('productsGrid');
  const empty=document.getElementById('shopEmpty');
  if(!grid)return;
  if(!products.length){grid.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  const disc=(p)=>p.salePrice?Math.round((1-p.salePrice/p.price)*100):0;
  const stockInfo=(s)=>s>10?{cls:'in',txt:'✓ In Stock'}:s>0?{cls:'low',txt:'⚠ Only '+s+' left!'}:{cls:'out',txt:'✗ Out of Stock'};
  grid.innerHTML=products.map(p=>{
    const price=p.salePrice||p.price,d=disc(p),st=stockInfo(p.stock||99),wished=_wishlist.includes(p._id);
    const imgHtml=p.imageUrl?`<img src="${p.imageUrl}" alt="${p.name}" loading="lazy">`:`<div class="prod-emoji">${p.emoji||'💊'}</div>`;
    return `<div class="product-card-3d" data-cat="${p.category}" data-price="${price}" data-rating="${p.rating?.avg||0}" data-count="${p.rating?.count||0}" data-id="${p._id}">
      <div class="prod-img-wrap">
        ${imgHtml}
        ${p.badge?`<span class="prod-badge ${getBadgeClass(p.badge)}">${p.badge.toUpperCase()}</span>`:''}
        <div class="prod-wishlist ${wished?'active':''}" onclick="toggleWishlist('${p._id}',this)">${wished?'❤️':'🤍'}</div>
        <div class="prod-quick-view" onclick="openQuickView('${p._id}')">🔍 QUICK VIEW</div>
      </div>
      <div class="prod-info">
        <div class="prod-cat">${p.category?.toUpperCase()||'PRODUCT'}</div>
        <div class="prod-name">${p.name}</div>
        <div class="prod-desc">${p.description||''}</div>
        <div class="prod-stars">${renderStars(p.rating?.avg||4)} <span style="color:#666;font-size:0.7rem">(${p.rating?.count||0})</span></div>
        <div class="prod-price-row">
          <span class="prod-price-new">Rs. ${price.toLocaleString()}</span>
          ${p.salePrice?`<span class="prod-price-old">Rs. ${p.price.toLocaleString()}</span>`:''}
          ${d>0?`<span class="prod-discount">${d}% OFF</span>`:''}
        </div>
        <div class="prod-stock ${st.cls}">${st.txt}</div>
        <div class="prod-actions">
          <button class="btn-add-cart" ${st.cls==='out'?'disabled':''} onclick="addToCart('${p.name}',${price},'${p._id}')">
            ${st.cls==='out'?'OUT OF STOCK':'🛒 ADD TO CART'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Products rendered after the initial animation scan should still appear.
  grid.querySelectorAll('.product-card-3d').forEach(card => card.classList.add('visible'));
}

function toggleWishlist(id,el){
  if(_wishlist.includes(id)){_wishlist=_wishlist.filter(x=>x!==id);el.classList.remove('active');el.textContent='🤍';showToast('Removed from wishlist');}
  else{_wishlist.push(id);el.classList.add('active');el.textContent='❤️';showToast('❤️ Added to wishlist!');}
  localStorage.setItem('cfp_wishlist',JSON.stringify(_wishlist));
}

function openQuickView(id){
  const p=_allProducts.find(x=>x._id===id);if(!p)return;
  const price=p.salePrice||p.price,d=p.salePrice?Math.round((1-p.salePrice/p.price)*100):0;
  const imgHtml=p.imageUrl?`<img src="${p.imageUrl}" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin-bottom:1.5rem">`:`<div style="font-size:6rem;text-align:center;margin-bottom:1.5rem;background:linear-gradient(135deg,#1a0a0a,#0d0d0d);border-radius:12px;padding:1.5rem">${p.emoji||'💊'}</div>`;
  document.getElementById('quickViewContent').innerHTML=`
    ${imgHtml}
    <div style="font-size:0.7rem;color:#CC0000;font-weight:700;letter-spacing:0.1em">${p.category?.toUpperCase()}</div>
    <h3 style="font-family:'Bebas Neue';font-size:1.8rem;margin:0.3rem 0">${p.name}</h3>
    <p style="color:#888;font-size:0.85rem;margin-bottom:1rem;line-height:1.6">${p.description||''}</p>
    <div style="color:#f39c12;margin-bottom:0.5rem">${renderStars(p.rating?.avg||4)} <span style="color:#666;font-size:0.78rem">(${p.rating?.count||0} reviews)</span></div>
    <div style="display:flex;align-items:center;gap:0.8rem;margin:1rem 0;flex-wrap:wrap">
      <span style="font-size:1.6rem;font-weight:900;color:#CC0000">Rs. ${price.toLocaleString()}</span>
      ${p.salePrice?`<span style="color:#555;text-decoration:line-through">Rs. ${p.price.toLocaleString()}</span>`:''}
      ${d>0?`<span style="font-size:0.78rem;background:rgba(46,204,113,0.15);color:#2ecc71;padding:0.2rem 0.6rem;border-radius:4px;font-weight:700">${d}% OFF</span>`:''}
    </div>
    <button class="btn-add-cart" style="width:100%;padding:0.9rem;font-size:1rem" ${!p.stock?'disabled':''} onclick="addToCart('${p.name}',${price},'${p._id}');closeModal('quickViewModal')">
      🛒 ADD TO CART
    </button>`;
  const qvm=document.getElementById('quickViewModal');
  if(qvm){qvm.style.display='flex';document.body.style.overflow='hidden';}
}

async function loadProductsFromAPI(){
  setShopEmptyMessage('Loading admin products...');
  renderProducts(_allProducts);
  const{ok,data}=await api('/products');
  if(ok&&Array.isArray(data.products)){
    _allProducts=data.products;
    setShopEmptyMessage('Products added by the admin will appear here.');
    renderProducts(filterAndSort(_allProducts,_currentCat));
    return;
  }
  setShopEmptyMessage(data.message||'No admin products are available right now.');
  renderProducts([]);
}

function filterAndSort(products,cat){
  let filtered=cat==='all'?[...products]:products.filter(p=>p.category===cat);
  const sort=document.getElementById('shopSort')?.value||'default';
  if(sort==='price-low')filtered.sort((a,b)=>(a.salePrice||a.price)-(b.salePrice||b.price));
  else if(sort==='price-high')filtered.sort((a,b)=>(b.salePrice||b.price)-(a.salePrice||a.price));
  else if(sort==='rating')filtered.sort((a,b)=>(b.rating?.avg||0)-(a.rating?.avg||0));
  else if(sort==='popular')filtered.sort((a,b)=>(b.rating?.count||0)-(a.rating?.count||0));
  return filtered;
}

// ── BMI ──────────────────────────────────────
let selectedGender = 'male';
let selectedUnit = 'metric';

document.querySelectorAll('.gender-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGender = btn.dataset.g;
  });
});

document.querySelectorAll('.calc-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedUnit = tab.dataset.unit;
    
    // Switch placeholders
    const hInput = document.getElementById('height');
    const wInput = document.getElementById('weight');
    if (selectedUnit === 'metric') {
      if(hInput) hInput.placeholder = 'Height (cm)';
      if(wInput) wInput.placeholder = 'Weight (kg)';
    } else {
      if(hInput) hInput.placeholder = 'Height (inches)';
      if(wInput) wInput.placeholder = 'Weight (lbs)';
    }
  });
});

function calculateBMI() {
  const hRaw = parseFloat(document.getElementById('height').value);
  const wRaw = parseFloat(document.getElementById('weight').value);
  const a = parseInt(document.getElementById('age').value);
  
  if (!hRaw || !wRaw || !a) { showToast('⚠️ Please fill all fields'); return; }
  
  let bmi = 0;
  if (selectedUnit === 'metric') {
    const h = hRaw / 100;
    bmi = (wRaw / (h * h));
  } else {
    // Standard: 703 * weight (lbs) / [height (in)]^2
    bmi = (703 * wRaw) / (hRaw * hRaw);
  }
  
  bmi = bmi.toFixed(1);
  let status, color, position;
  if (bmi < 18.5)    { status='⬇️ Underweight'; color='#3498db'; position=5; }
  else if (bmi < 25) { status='✅ Normal Weight'; color='#2ecc71'; position=30; }
  else if (bmi < 30) { status='⚠️ Overweight'; color='#f39c12'; position=60; }
  else               { status='🔴 Obese'; color='#e74c3c'; position=88; }
  
  document.getElementById('bmiNumber').textContent = bmi;
  document.getElementById('bmiNumber').style.color = color;
  document.getElementById('bmiStatus').textContent = status;
  document.getElementById('bmiIndicator').style.left = position + '%';
  showToast(`BMI: ${bmi} — ${status}`);
}

// ── Billing Toggle ───────────────────────────
function toggleBilling() {
  const isYearly = document.getElementById('billingToggle').checked;
  document.querySelectorAll('.monthly-price').forEach(el => {
    el.textContent = (isYearly ? parseInt(el.dataset.yearly) : parseInt(el.dataset.monthly)).toLocaleString();
  });
  document.querySelectorAll('.period').forEach(el => {
    el.textContent = isYearly ? '/month (billed yearly)' : '/month';
  });
}

// ── Diet Tabs ────────────────────────────────
function showDietTab(tab) {
  document.querySelectorAll('.diet-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.diet-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('diet-' + tab).classList.add('active');
  event.target.classList.add('active');
}

// ── Shop Filter ──────────────────────────────
function filterShop(cat,btn){
  _currentCat=cat;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderProducts(filterAndSort(_allProducts,cat));
}
function searchProducts(){
  const q=document.getElementById('shopSearch')?.value.toLowerCase()||'';
  const filtered=_allProducts.filter(p=>p.name.toLowerCase().includes(q)||(p.description||'').toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q));
  renderProducts(_currentCat==='all'?filtered:filtered.filter(p=>p.category===_currentCat));
}
function sortProducts(){renderProducts(filterAndSort(_allProducts,_currentCat));}

// ── Cart ─────────────────────────────────────
let cart = [];
function addToCart(name, price, id = null) {
  const existing = cart.find(i => i.name === name);
  if (existing) existing.qty++;
  else cart.push({ name, price, qty: 1, id });
  updateCartCount();
  showToast(`🛒 ${name} added to cart!`);
}
function updateCartCount() {
  document.getElementById('cartCount').textContent = cart.reduce((s, i) => s + i.qty, 0);
}
function openCart() {
  const cartItems = document.getElementById('cartItems');
  if (cart.length === 0) {
    cartItems.innerHTML = '<p style="color:#888;text-align:center;padding:2rem">Cart is empty</p>';
    document.getElementById('cartTotal').textContent = '';
  } else {
    cartItems.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <span class="cart-item-name">${item.name} x${item.qty}</span>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span class="cart-item-price">Rs. ${(item.price * item.qty).toLocaleString()}</span>
          <button class="cart-item-remove" onclick="removeFromCart(${idx})">✕</button>
        </div>
      </div>`).join('');
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    document.getElementById('cartTotal').textContent = `Total: Rs. ${total.toLocaleString()}`;
  }
  openModal('cartModal');
}
function removeFromCart(idx) { cart.splice(idx, 1); updateCartCount(); openCart(); }
async function checkoutCart() {
  if (cart.length === 0) return;
  if (!localStorage.getItem('cfp_token')) {
    showToast('⚠️ Please login to checkout');
    setTimeout(() => window.location.href = 'member.html', 1500);
    return;
  }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  closeModal('cartModal');
  window._checkoutTotal = total;
  window._checkoutType = 'product';
  document.getElementById('paymentPlan').textContent = 'Shop Order';
  document.getElementById('paymentAmount').textContent = `Rs. ${total.toLocaleString()}`;
  openModal('paymentModal');
}

// ── Class Booking ────────────────────────────
function openBooking(className) {
  if (!localStorage.getItem('cfp_token')) {
    showToast('⚠️ Please login to book a class');
    setTimeout(() => window.location.href = 'member.html', 1500);
    return;
  }
  document.getElementById('bookingClassName').textContent = className;
  loadBookingTrainers();
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    dateInput.min = today.toISOString().split('T')[0];
  }
  openModal('bookingModal');
}
async function loadBookingTrainers() {
  const trainerSelect = document.getElementById('bookingTrainer');
  if (!trainerSelect) return;
  trainerSelect.innerHTML = '<option>Loading trainers...</option>';
  const { ok, data } = await api('/trainers');
  if (!ok || !data.trainers?.length) {
    trainerSelect.innerHTML = '<option value="">No trainers available</option>';
    return;
  }
  trainerSelect.innerHTML = `
    <option value="">Select a trainer</option>
    ${data.trainers.map(t => `<option value="${t._id}">${t.firstName} ${t.lastName || ''}</option>`).join('')}
  `;
}
async function confirmBooking(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const trainerId = document.getElementById('bookingTrainer')?.value || '';
  const date = document.getElementById('bookingDate')?.value || '';
  const time = document.getElementById('bookingTime')?.value || '';
  const className = document.getElementById('bookingClassName')?.textContent || '';
  if (!trainerId) { showToast('⚠️ Please select a trainer'); return; }
  if (!date) { showToast('⚠️ Please select a date'); return; }
  if (!time) { showToast('⚠️ Please select a time'); return; }
  btn.textContent = 'Booking...'; btn.disabled = true;
  const timeMap = { '6:00 AM':'06:00','8:00 AM':'08:00','10:00 AM':'10:00','5:00 PM':'17:00','7:00 PM':'19:00' };
  const { ok, data } = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      trainerId,
      date: `${date}T${timeMap[time] || '06:00'}`,
      time,
      className,
      type: className.toLowerCase().includes('personal training') ? 'pt_session' : 'class'
    })
  });
  btn.textContent = 'Confirm Booking'; btn.disabled = false;
  closeModal('bookingModal');
  showToast(ok ? '🎉 Class booked successfully!' : '❌ ' + (data.message || 'Booking failed'));
  if (ok) {
    const trainerSelect = document.getElementById('bookingTrainer');
    const dateInput = document.getElementById('bookingDate');
    const timeSelect = document.getElementById('bookingTime');
    if (trainerSelect) trainerSelect.selectedIndex = 0;
    if (dateInput) dateInput.value = '';
    if (timeSelect) timeSelect.selectedIndex = 0;
  }
}

// ── Membership Payment ───────────────────────
let currentPlan = '', currentAmount = 0;
function openPayment(plan, amount) {
  currentPlan = plan; currentAmount = amount;
  const toggleEl = document.getElementById('billingToggle');
  const isYearly = toggleEl ? toggleEl.checked : false;
  const finalAmount = isYearly ? Math.floor(amount * 0.8) : amount;
  
  const pPlan = document.getElementById('paymentPlan');
  if(pPlan) pPlan.textContent = `${plan} Plan`;
  
  const pAmount = document.getElementById('paymentAmount');
  if(pAmount) pAmount.textContent = `Rs. ${finalAmount.toLocaleString()}/month`;
  const pTitle = document.querySelector('#paymentModal h2');
  if (pTitle) pTitle.textContent = 'Counter Payment';
  
  window._checkoutTotal = finalAmount;
  window._checkoutType = 'membership';
  window._checkoutYearly = isYearly;
  openModal('paymentModal');
}
async function processPayment(method) {
  const token = localStorage.getItem('cfp_token');
  if (!token && method !== 'Cash') {
    closeModal('paymentModal');
    showToast('⚠️ Please login first');
    setTimeout(() => window.location.href = 'member.html', 1500);
    return;
  }
  const amount = window._checkoutTotal || currentAmount;
  const type   = window._checkoutType  || 'membership';
  const desc   = type === 'membership' ? `${currentPlan} Membership Plan` : 'Shop Order';
  closeModal('paymentModal');

  if (method === 'Cash') {
    showToast('💵 Please visit the gym counter. We will activate your membership!');
    return;
  }

  const methodMap = {
    'eSewa': 'esewa',
    'Bank': 'prabhu_bank',
    'Khalti': 'khalti'
  };
  const targetMethod = methodMap[method] || 'esewa';
  showToast('🔄 Redirecting to secure QR payment portal...');
  setTimeout(() => window.location.href = `payment.html?method=${targetMethod}`, 1000);
}

// ── Contact Form ─────────────────────────────
function processPayment(method) {
  const amount = window._checkoutTotal || currentAmount;
  const type = window._checkoutType || 'membership';
  const label = type === 'membership' ? `${currentPlan} plan` : 'your shop items';
  closeModal('paymentModal');

  if (method === 'Cash') {
    showToast(`Please pay Rs. ${amount.toLocaleString()} for ${label} at the gym counter.`);
    return;
  }

  showToast('QR payment has been removed. Please pay at the gym counter.');
}

async function submitContact(e) {
  e.preventDefault();
  const form = e.target;
  const errorDiv = document.getElementById('contactFormError');
  if(errorDiv) errorDiv.style.display = 'none';
  
  if(!form.checkValidity()){
    if(errorDiv) {
       errorDiv.textContent = 'Please fill out all fields correctly. Phone must be 10 digits.';
       errorDiv.style.display = 'block';
    } else {
       showToast('⚠️ Please fill out all required fields.');
    }
    Array.from(form.elements).forEach(el => {
      if(!el.checkValidity() && el.tagName !== 'BUTTON') el.style.border = '1px solid var(--red)';
      else if(el.tagName !== 'BUTTON') el.style.border = '';
    });
    return;
  }
  Array.from(form.elements).forEach(el => { if(el.tagName !== 'BUTTON') el.style.border = ''; });

  const btn = form.querySelector('button[type="submit"]');
  btn.textContent = 'Sending...'; btn.disabled = true;
  const body = {
    name:    document.getElementById('contactName')?.value.trim() || Array.from(form.querySelectorAll('input[type="text"]')).map(n => n.value).join(' ').trim(),
    phone:   document.getElementById('contactPhone')?.value.trim() || form.querySelector('input[type="tel"]')?.value || '',
    email:   document.getElementById('contactEmail')?.value.trim() || form.querySelector('input[type="email"]')?.value || '',
    type:    document.getElementById('contactType')?.value || form.querySelector('select')?.value || '',
    message: document.getElementById('contactMessage')?.value.trim() || form.querySelector('textarea')?.value || ''
  };
  const { ok, data } = await api('/contact', { method: 'POST', body: JSON.stringify(body) });
  btn.textContent = 'Send Message'; btn.disabled = false;
  if (ok) { showToast('✅ Message sent! We will contact you soon.'); form.reset(); }
  else showToast('❌ ' + (data.message || 'Failed to send'));
}

// ── Testimonials Slider ──────────────────────
let currentSlide = 0;
function goToSlide(index) {
  const track = document.getElementById('testimonialTrack');
  const dots = document.querySelectorAll('.dot');
  if (!track || !dots.length) return;
  if (index < 0) index = dots.length - 1;
  if (index >= dots.length) index = 0;
  currentSlide = index;
  const cardWidth = track.querySelector('.testimonial-card').offsetWidth + 24;
  track.style.transform = `translateX(-${index * cardWidth}px)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
}
setInterval(() => {
  const dots = document.querySelectorAll('.dot');
  if (dots.length) goToSlide((currentSlide + 1) % dots.length);
}, 5000);

const testTrack = document.getElementById('testimonialTrack');
if(testTrack) {
  let startX = 0;
  let isDragging = false;
  testTrack.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; isDragging = true; }, {passive:true});
  testTrack.addEventListener('touchmove', (e) => {
    if(!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = startX - currentX;
    if (diff > 50) { goToSlide(currentSlide + 1); isDragging = false; }
    else if (diff < -50) { goToSlide(currentSlide - 1); isDragging = false; }
  }, {passive:true});
  testTrack.addEventListener('touchend', () => isDragging = false);
}

// ── Modals ───────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('active'); document.body.style.overflow = ''; }
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
});

// ── Toast ────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Smooth Scroll ────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',e=>{
    const target=document.querySelector(a.getAttribute('href'));
    if(target){
      e.preventDefault();
      target.scrollIntoView({behavior:'smooth'});
      document.getElementById('navLinks')?.classList.remove('open');
      if(typeof closeMobileMenu==='function')closeMobileMenu();
    }
  });
});

// ── Parallax ─────────────────────────────────
window.addEventListener('scroll', () => {
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) heroBg.style.transform = `translateY(${window.scrollY * 0.3}px)`;
});

// ── Payment redirect handler ─────────────────
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('gateway') && urlParams.get('pid')) {
  const gateway = urlParams.get('gateway');
  const pid = urlParams.get('pid');
  (async () => {
    if (gateway === 'esewa') {
      const { ok } = await api('/payments/esewa/verify', {
        method: 'POST',
        body: JSON.stringify({ oid: urlParams.get('oid') || pid, amt: urlParams.get('amt'), refId: urlParams.get('refId') })
      });
      showToast(ok ? '✅ eSewa payment verified! Membership activated.' : '❌ Payment verification failed');
    }
    if (gateway === 'khalti') {
      const { ok } = await api('/payments/khalti/verify', {
        method: 'POST',
        body: JSON.stringify({ pidx: urlParams.get('pidx'), paymentId: pid })
      });
      showToast(ok ? '✅ Khalti payment verified! Membership activated.' : '❌ Khalti verification failed');
    }
  })();
}

// ── Contact Form Submission ──────────────────
async function submitContact(e) {
  e.preventDefault();
  const errDiv = document.getElementById('contactFormError');
  errDiv.style.display = 'none';
  const name = document.getElementById('contactName').value;
  const phone = document.getElementById('contactPhone').value;
  const email = document.getElementById('contactEmail').value;
  const type = document.getElementById('contactType').value;
  const message = document.getElementById('contactMessage').value;

  const btn = e.target.querySelector('button');
  const orgText = btn.innerText;
  btn.innerText = 'Sending...';
  btn.disabled = true;

  try {
    const { ok, data } = await api('/contact', {
      method: 'POST',
      body: JSON.stringify({ name, phone, email, type, message })
    });
    if (ok) {
      showToast(data.message || 'Message sent successfully!');
      e.target.reset();
    } else {
      errDiv.innerText = data?.message || 'Failed to send message.';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.innerText = 'Connection error.';
    errDiv.style.display = 'block';
  } finally {
    btn.innerText = orgText;
    btn.disabled = false;
  }
}

// ── Gallery ──────────────────────────────────
function resolveGalleryImageUrl(imageUrl) {
  if (!imageUrl) return '';

  try {
    const apiOrigin = new URL(API_URL, window.location.href).origin;
    return new URL(imageUrl, apiOrigin).toString();
  } catch {
    return imageUrl;
  }
}

async function loadGalleryFromAPI() {
  const { ok, data } = await api('/gallery');
  const galleryGrid = document.getElementById('galleryGrid');
  if (!galleryGrid) return;
  if (ok && data.photos && data.photos.length > 0) {
    const photos = data.photos
      .map((photo) => ({
        ...photo,
        imageUrl: resolveGalleryImageUrl(photo.imageUrl)
      }))
      .filter((photo) => photo.imageUrl);

    if (!photos.length) return;

    galleryGrid.innerHTML = photos.map(p => `
      <article class="gallery-card-real">
        <img src="${p.imageUrl}" alt="${p.title || 'Gym gallery'}" loading="lazy">
        <div class="gallery-card-copy">
          <strong>${p.title || 'Classic Fitness Park'}</strong>
          <span>${p.description || 'Real moments and spaces from the gym floor.'}</span>
        </div>
      </article>
    `).join('');
  }
}

// Ensure the gallery loads inside the window load function:
window.addEventListener('load', () => { setTimeout(loadGalleryFromAPI, 2000); });
