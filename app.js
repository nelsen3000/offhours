const $ = (sel, el = document) => el.querySelector(sel);

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem("oh_" + key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem("oh_" + key, JSON.stringify(val)); }
};

function seed() {
  if (!store.get("bookings")) store.set("bookings", []);
  if (!store.get("user")) store.set("user", null);
  if (!store.get("listed")) store.set("listed", []);
}
seed();

function money(n) { return "$" + n.toFixed(2); }
function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function kitchenById(id) {
  return KITCHENS.find(k => k.id === id) || store.get("listed", []).find(k => k.id === id);
}
function allKitchens() { return [...KITCHENS, ...store.get("listed", [])]; }
function user() { return store.get("user"); }
function bookings() { return store.get("bookings", []); }
function setUser(u) { store.set("user", u); }

function route() {
  const hash = location.hash.replace("#", "") || "/";
  const [path, qs] = hash.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  return { path, params };
}
function go(to) { location.hash = to; }

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

function nav() {
  const u = user();
  return `
    <header class="nav">
      <div class="brand" onclick="go('/')">
        <div class="mark">OH</div>
        <div class="brand-name">OffHours</div>
      </div>
      <div class="nav-links">
        <button onclick="go('/')">Find a kitchen</button>
        <button onclick="go('/host')">List your kitchen</button>
        ${u ? `<button onclick="go('/dashboard')">Dashboard</button>
               <button onclick="logout()">Sign out</button>`
            : `<button class="btn" onclick="go('/login')">Sign in</button>`}
      </div>
    </header>`;
}

function footer() {
  return `<div class="footer">OffHours demo · kitchens idle after close · 10% platform fee · NYC sample listings · data stays in your browser</div>`;
}

function render() {
  const r = route();
  const root = $("#app");
  const map = {
    "/": home,
    "/kitchen": kitchenPage,
    "/book": bookPage,
    "/checkout": checkoutPage,
    "/confirm": confirmPage,
    "/login": loginPage,
    "/host": hostPage,
    "/dashboard": dashboardPage
  };
  const view = map[r.path] || home;
  root.innerHTML = nav() + view(r.params) + footer();
  if (r.path === "/kitchen") paintSlots(r.params.id);
}

function home(params) {
  const q = (params.q || "").toLowerCase();
  const max = Number(params.max || 999);
  const list = allKitchens().filter(k =>
    (!q || (k.name + k.neighborhood + k.city).toLowerCase().includes(q)) && k.rate <= max
  );
  return `
    <div class="wrap">
      <section class="hero">
        <h1>Restaurant kitchens. After they close.</h1>
        <p>Book licensed commercial kitchens by the hour — overnight, when the dining room is dark. Caterers, bakers, food trucks, and market vendors cook. Hosts earn on dead time. OffHours takes 10%.</p>
        <form class="search" onsubmit="event.preventDefault(); searchKitchens()">
          <input id="q" placeholder="Neighborhood or kitchen" value="${params.q || ""}" />
          <select id="max">
            <option value="999">Any rate</option>
            <option value="30" ${max===30?"selected":""}>Under $30/hr</option>
            <option value="40" ${max===40?"selected":""}>Under $40/hr</option>
            <option value="50" ${max===50?"selected":""}>Under $50/hr</option>
          </select>
          <button class="btn" type="submit">Search</button>
        </form>
        <div class="stats">
          <div><b>${allKitchens().length}</b> kitchens live</div>
          <div><b>$15–$75</b> typical hourly</div>
          <div><b>Food handler card</b> required</div>
          <div><b>Host approves</b> every first booking</div>
        </div>
      </section>
      <section class="how">
        <h2 class="serif">How it works</h2>
        <div class="grid how-grid">
          <div class="how-card"><b>1. Find idle hours</b><p class="muted">Browse licensed restaurant kitchens available overnight after last seating.</p></div>
          <div class="how-card"><b>2. Show your card</b><p class="muted">Upload a food handler card. The host approves before anyone cooks.</p></div>
          <div class="how-card"><b>3. Pay only if approved</b><p class="muted">Payment is held at checkout. OffHours takes 10%. Hosts set the rate.</p></div>
        </div>
      </section>
      <div class="grid">
        ${list.map(k => `
          <article class="card" onclick="go('/kitchen?id=${k.id}')">
            <img src="${k.thumb || k.image}" alt="${k.name}" />
            <div class="card-body">
              <div class="meta"><span>${k.neighborhood} · ${k.city}</span><span>★ ${k.rating} (${k.reviews})</span></div>
              <h3>${k.name}</h3>
              <p class="muted">${k.hours} · ${k.capacity} cooks</p>
              <p class="price">${money(k.rate)} <span>/ hour</span></p>
            </div>
          </article>`).join("") || "<p class='muted'>No kitchens match.</p>"}
      </div>
    </div>`;
}

function searchKitchens() {
  const q = encodeURIComponent($("#q").value);
  const max = $("#max").value;
  go(`/?q=${q}&max=${max}`);
}

function kitchenPage({ id }) {
  const k = kitchenById(id);
  if (!k) return `<div class="wrap"><p>Kitchen not found.</p></div>`;
  const dates = [0,1,2,3,4,5,6].map(addDays);
  return `
    <div class="wrap">
      <p class="muted" style="margin-bottom:12px;cursor:pointer" onclick="go('/')">← All kitchens</p>
      <img class="hero-img" src="${k.image}" alt="${k.name}" />
      <div class="detail" style="margin-top:22px">
        <div>
          <div class="meta"><span>${k.neighborhood} · ${k.city}</span><span>★ ${k.rating} · ${k.reviews} reviews</span></div>
          <h2 class="serif">${k.name}</h2>
          <p>${k.blurb}</p>
          <div class="chips">${k.equipment.map(e => `<span class="chip">${e}</span>`).join("")}</div>
          <div class="stack" style="margin-top:18px">
            <p><b>Overnight window</b><br><span class="muted">${k.hours}</span></p>
            <p><b>Address</b><br><span class="muted">${k.address}</span></p>
            <p><b>Permits</b><br><span class="muted">${k.permits}</span></p>
            <p><b>House rules</b><br><span class="muted">${k.rules}</span></p>
            <p><b>Host</b><br><span class="muted">${k.host} sets the rate and approves bookings. You pay only when a booking is approved.</span></p>
          </div>
        </div>
        <aside class="book-box">
          <p class="price" style="font-size:28px">${money(k.rate)} <span>/ hour</span></p>
          <label>Night
            <select id="bookDate">
              ${dates.map(d => `<option value="${d}">${fmtDate(d)}</option>`).join("")}
            </select>
          </label>
          <div class="slots" id="slotList"></div>
          <button class="btn" style="width:100%" onclick="startBook('${k.id}')">Request this kitchen</button>
          <p class="muted" style="margin-top:10px;font-size:13px">Host approval required. 10% OffHours fee added at checkout. License upload required.</p>
        </aside>
      </div>
    </div>`;
}

function paintSlots(id) {
  const k = kitchenById(id);
  const box = $("#slotList");
  const dateEl = $("#bookDate");
  if (!k || !box || !dateEl) return;
  const paint = () => {
    const date = dateEl.value;
    box.innerHTML = DEFAULT_SLOTS.map((s, i) => {
      const taken = bookings().some(b => b.kitchenId === k.id && b.date === date && b.slot === i && b.status !== "declined");
      return `<div class="slot ${taken ? "busy" : ""}" onclick="pickSlot(this,${i})"><span>${s.start} – ${s.end}</span><span>${taken ? "Booked" : s.hours + " hrs · " + money(s.hours * k.rate)}</span></div>`;
    }).join("");
  };
  dateEl.onchange = paint;
  paint();
}

let pickedSlot = 0;
function pickSlot(el, i) {
  pickedSlot = i;
  document.querySelectorAll(".slot").forEach(s => s.classList.remove("on"));
  el.classList.add("on");
}
function startBook(id) {
  const date = $("#bookDate").value;
  if (!user()) { go("/login?next=" + encodeURIComponent(`/book?id=${id}&date=${date}&slot=${pickedSlot}`)); return; }
  go(`/book?id=${id}&date=${date}&slot=${pickedSlot}`);
}

function bookPage({ id, date, slot }) {
  const k = kitchenById(id);
  if (!k) return `<div class="wrap">Missing kitchen.</div>`;
  const u = user();
  if (!u) return `<div class="wrap"><p>Sign in first.</p></div>`;
  const s = DEFAULT_SLOTS[Number(slot) || 0];
  const sub = s.hours * k.rate;
  const fee = sub * PLATFORM_FEE;
  return `
    <div class="wrap" style="max-width:640px">
      <h2 class="serif">Request booking</h2>
      <p class="muted">${k.name} · ${fmtDate(date)} · ${s.start}–${s.end} (${s.hours} hrs)</p>
      <div class="stack" style="margin-top:18px">
        <div class="notice">NYC kitchens require a current food handler card before the host can approve you. Upload a photo or PDF. This demo stores it only in your browser.</div>
        <div class="form">
          <label>Business / cook name<input id="biz" value="${u.biz || u.name}" /></label>
          <label>What are you making?<textarea id="what" rows="3" placeholder="Overnight cookie production for Saturday market, 40 dozen"></textarea></label>
          <label>Food handler card
            <input type="file" id="card" accept="image/*,.pdf" />
          </label>
          <p class="muted" id="cardStatus">${u.license ? "Card already on file: " + u.license : "No card on file yet."}</p>
        </div>
        <div>
          <div class="row"><span>Kitchen (${s.hours} × ${money(k.rate)})</span><span>${money(sub)}</span></div>
          <div class="row"><span>OffHours fee (10%)</span><span>${money(fee)}</span></div>
          <div class="row total"><span>Total held at checkout</span><span>${money(sub + fee)}</span></div>
        </div>
        <button class="btn" onclick="toCheckout('${id}','${date}',${slot})">Continue to payment hold</button>
      </div>
    </div>`;
}

function toCheckout(id, date, slot) {
  const file = $("#card")?.files?.[0];
  const u = user();
  if (file) {
    u.license = file.name;
    u.licenseAt = new Date().toISOString();
  }
  u.biz = $("#biz").value;
  if (!u.license) { alert("Upload a food handler card (any file works in this demo)."); return; }
  setUser(u);
  const what = $("#what").value;
  go(`/checkout?id=${id}&date=${date}&slot=${slot}&what=${encodeURIComponent(what)}`);
}

function checkoutPage({ id, date, slot, what }) {
  const k = kitchenById(id);
  const s = DEFAULT_SLOTS[Number(slot) || 0];
  const sub = s.hours * k.rate;
  const fee = +(sub * PLATFORM_FEE).toFixed(2);
  const total = +(sub + fee).toFixed(2);
  return `
    <div class="wrap" style="max-width:640px">
      <h2 class="serif">Hold payment</h2>
      <p class="muted">Funds are authorized now. The host is paid only after they approve. If they decline, the hold is released.</p>
      <div class="form" style="margin-top:16px">
        <label>Name on card<input value="${user()?.name || ""}" /></label>
        <label>Card number<input value="4242 4242 4242 4242" /></label>
        <div class="split">
          <label style="flex:1">Exp<input value="12 / 28" /></label>
          <label style="flex:1">CVC<input value="123" /></label>
        </div>
        <div class="row total"><span>Authorization</span><span>${money(total)}</span></div>
        <button class="btn" onclick="placeBooking('${id}','${date}',${slot},'${(what||"").replace(/'/g,"")}','${total}')">Authorize ${money(total)}</button>
        <p class="muted" style="font-size:13px">Demo only. No real charge. Card fields are fake.</p>
      </div>
    </div>`;
}

function placeBooking(id, date, slot, what, total) {
  const u = user();
  const k = kitchenById(id);
  const s = DEFAULT_SLOTS[Number(slot) || 0];
  const list = bookings();
  const booking = {
    id: "b" + Date.now(),
    kitchenId: id,
    kitchenName: k.name,
    host: k.host,
    cook: u.name,
    cookEmail: u.email,
    biz: u.biz,
    license: u.license,
    date, slot, slotLabel: s.start + "–" + s.end, hours: s.hours,
    rate: k.rate,
    subtotal: s.hours * k.rate,
    fee: +(s.hours * k.rate * PLATFORM_FEE).toFixed(2),
    total: Number(total),
    what, status: "pending",
    created: new Date().toISOString()
  };
  list.unshift(booking);
  store.set("bookings", list);
  go("/confirm?id=" + booking.id);
}

function confirmPage({ id }) {
  const b = bookings().find(x => x.id === id);
  if (!b) return `<div class="wrap">Booking missing.</div>`;
  return `
    <div class="wrap" style="max-width:640px">
      <div class="okbox">Request sent. ${b.kitchenName} will approve or decline. You are not charged until they accept.</div>
      <h2 class="serif" style="margin-top:18px">You're on the list</h2>
      <p>${fmtDate(b.date)} · ${b.slotLabel}<br>${b.kitchenName}</p>
      <p class="muted" style="margin-top:10px">Food handler card on file: ${b.license}</p>
      <p class="muted">Hold: ${money(b.total)} (includes 10% fee of ${money(b.fee)})</p>
      <div class="split" style="margin-top:18px">
        <button class="btn" onclick="go('/dashboard')">View dashboard</button>
        <button class="btn outline" onclick="go('/')">Find another kitchen</button>
      </div>
    </div>`;
}

function loginPage({ next }) {
  return `
    <div class="wrap" style="max-width:480px">
      <h2 class="serif">Sign in</h2>
      <p class="muted">Demo accounts live only in this browser.</p>
      <div class="form" style="margin-top:16px">
        <label>Name<input id="name" placeholder="Your name" /></label>
        <label>Email<input id="email" placeholder="you@studio.com" /></label>
        <label>I am
          <select id="role">
            <option value="cook">A cook / food business</option>
            <option value="host">A kitchen host</option>
            <option value="both">Both</option>
          </select>
        </label>
        <button class="btn" onclick="signin('${next || "/"}')">Continue</button>
      </div>
    </div>`;
}

function signin(next) {
  const name = $("#name").value.trim();
  const email = $("#email").value.trim();
  if (!name || !email) { alert("Name and email required."); return; }
  setUser({ name, email, role: $("#role").value, biz: name, license: null });
  go(decodeURIComponent(next || "/"));
}
function logout() { setUser(null); go("/"); }

function hostPage() {
  const u = user();
  if (!u) return `<div class="wrap"><p>Sign in to list a kitchen.</p><button class="btn" onclick="go('/login?next=/host')">Sign in</button></div>`;
  return `
    <div class="wrap" style="max-width:640px">
      <h2 class="serif">List idle hours</h2>
      <p class="muted">Set your rate. You approve every booking. OffHours takes 10% only when someone actually books.</p>
      <div class="form" style="margin-top:16px">
        <label>Kitchen name<input id="lname" placeholder="Sunday line at Osteria" /></label>
        <label>Neighborhood<input id="lhood" placeholder="East Village" /></label>
        <label>Address<input id="laddr" placeholder="12 E 7th St, New York, NY" /></label>
        <label>Hourly rate (USD)<input id="lrate" type="number" value="35" /></label>
        <label>Overnight window<input id="lhours" value="10:00 PM – 6:00 AM" /></label>
        <label>Equipment<input id="leq" placeholder="Range, convection, walk-in" /></label>
        <label>House rules<textarea id="lrules" rows="3">Clean as you go. Vacate by 6am.</textarea></label>
        <button class="btn gold" onclick="listKitchen()">Publish kitchen</button>
      </div>
    </div>`;
}

function listKitchen() {
  const listed = store.get("listed", []);
  const u = user();
  listed.unshift({
    id: "u" + Date.now(),
    name: $("#lname").value || "Untitled kitchen",
    neighborhood: $("#lhood").value || "NYC",
    city: "New York, NY",
    address: $("#laddr").value || "New York, NY",
    rate: Number($("#lrate").value || 35),
    rating: 5.0, reviews: 0,
    hours: $("#lhours").value,
    capacity: 4,
    equipment: ($("#leq").value || "Commercial line").split(",").map(s => s.trim()),
    permits: "Host-attested DOH permit",
    host: u.name,
    hostEmail: u.email,
    image: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1400&q=80",
    thumb: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
    blurb: "Host-listed kitchen on OffHours.",
    rules: $("#lrules").value,
    availableNights: [0,1,2,3,4,5,6]
  });
  store.set("listed", listed);
  go("/dashboard?tab=listings");
}

function dashboardPage({ tab }) {
  const u = user();
  if (!u) return `<div class="wrap"><button class="btn" onclick="go('/login?next=/dashboard')">Sign in</button></div>`;
  const t = tab || "bookings";
  const mine = bookings().filter(b => b.cookEmail === u.email);
  const incoming = bookings().filter(b => b.host === u.name || kitchenById(b.kitchenId)?.hostEmail === u.email);
  const listed = store.get("listed", []).filter(k => k.hostEmail === u.email || k.host === u.name);
  const earned = incoming.filter(b => b.status === "approved").reduce((s,b) => s + b.subtotal, 0);
  const fees = incoming.filter(b => b.status === "approved").reduce((s,b) => s + b.fee, 0);

  let body = "";
  if (t === "bookings") {
    body = mine.length ? table(mine, false) : `<p class="muted">No bookings yet.</p>`;
  } else if (t === "incoming") {
    body = incoming.length ? table(incoming, true) : `<p class="muted">No incoming requests.</p>`;
  } else {
    body = listed.length
      ? listed.map(k => `<div class="card" style="cursor:default;margin-bottom:12px"><div class="card-body"><h3>${k.name}</h3><p class="muted">${k.neighborhood} · ${money(k.rate)}/hr · ${k.hours}</p></div></div>`).join("")
      : `<p class="muted">No listings. <a href="#/host">List a kitchen</a></p>`;
  }

  return `
    <div class="wrap">
      <h2 class="serif">Dashboard</h2>
      <p class="muted">${u.name} · ${u.email} · card on file: ${u.license || "none"}</p>
      <div class="stats">
        <div><b>${mine.length}</b> your requests</div>
        <div><b>${incoming.filter(b=>b.status==="pending").length}</b> awaiting host</div>
        <div><b>${money(earned)}</b> host gross</div>
        <div><b>${money(fees)}</b> OffHours fees</div>
      </div>
      <div class="dash" style="margin-top:22px">
        <div class="side">
          <button class="${t==="bookings"?"on":""}" onclick="go('/dashboard?tab=bookings')">My bookings</button>
          <button class="${t==="incoming"?"on":""}" onclick="go('/dashboard?tab=incoming')">Host inbox</button>
          <button class="${t==="listings"?"on":""}" onclick="go('/dashboard?tab=listings')">My kitchens</button>
        </div>
        <div>${body}</div>
      </div>
    </div>`;
}

function table(rows, hostView) {
  return `
    <table class="table">
      <thead><tr><th>When</th><th>Kitchen</th><th>Cook</th><th>Total</th><th>Status</th>${hostView?"<th></th>":""}</tr></thead>
      <tbody>
        ${rows.map(b => `
          <tr>
            <td>${fmtDate(b.date)}<br><span class="muted">${b.slotLabel}</span></td>
            <td>${b.kitchenName}</td>
            <td>${b.biz || b.cook}<br><span class="muted">${b.license || ""}</span></td>
            <td>${money(b.total)}</td>
            <td><span class="badge ${b.status}">${b.status}</span></td>
            ${hostView ? `<td>${b.status==="pending" ? `
              <button class="btn" onclick="decide('${b.id}','approved')">Approve</button>
              <button class="btn outline" onclick="decide('${b.id}','declined')">Decline</button>` : ""}</td>` : ""}
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function decide(id, status) {
  const list = bookings().map(b => b.id === id ? { ...b, status } : b);
  store.set("bookings", list);
  render();
}
