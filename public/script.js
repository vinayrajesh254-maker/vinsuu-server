  let allServices = [];
        const API = window.location.origin + "/api";

        document.addEventListener("DOMContentLoaded", () => {
            loadLogo();
            loadSliderImages();
            loadCategories();
            loadWhyImage();
            loadPopularServices();
            loadAllServices();
        });

        // ===== SEARCH SERVICE =====
        async function loadAllServices() {

            try {

                const res = await fetch(API + "/admin/services");

                allServices = await res.json();
                console.log("SERVICES DATA:", allServices);

            } catch (err) {
                console.log(err);
            }
        }

        function searchServices() {

            const input =
                document.getElementById("serviceSearch");

            const dropdown =
                document.getElementById("searchDropdown");

            if (!input || !dropdown) return;

            const keyword = input.value.trim().toLowerCase();

            if (!keyword) {
                dropdown.style.display = "none";
                dropdown.innerHTML = "";
                return;
            }

            console.log(JSON.stringify(allServices[0], null, 2));

const filtered = allServices.filter(s => {

    const text = (
        s.name ||
        s.service_name ||
        s.title ||
        ""
    ).toLowerCase();

    return text.includes(keyword);

});

console.log("KEYWORD:", keyword);
console.log("FILTERED:", filtered);

            dropdown.innerHTML = filtered.map(s => `
        <div
            onclick="openServiceRequest(${s.id})"
            style="
                padding:12px;
                cursor:pointer;
                border-bottom:1px solid #eee;
                background:#fff;
            ">
           ${s.name || s.service_name || s.title}
        </div>
    `).join("");

            dropdown.style.display =
                filtered.length > 0 ? "block" : "none";
                console.log("DROPDOWN FOUND:", dropdown);
console.log("RESULT COUNT:", filtered.length);
        }

        function openServiceRequest(serviceId) {

            window.location.href =
                "request.html?service_id=" + serviceId;
        }

        document.addEventListener("click", () => {

            const dropdown =
                document.getElementById("searchDropdown");

            if (dropdown) {
                dropdown.style.display = "none";
            }

        });

         // ===== MOBILE SEARCH SERVICE =====
        function searchMobileServices() {

    const input =
        document.getElementById("mobileServiceSearch");

    const dropdown =
        document.getElementById("mobileSearchDropdown");

    const keyword = input.value.trim().toLowerCase();

    if (!keyword) {
        dropdown.style.display = "none";
        dropdown.innerHTML = "";
        return;
    }

    const filtered = allServices.filter(s =>
        (s.name || "").toLowerCase().includes(keyword)
    );

    dropdown.innerHTML = filtered.map(s => `
        <div
            onclick="openServiceRequest(${s.id})"
            style="
                padding:12px;
                cursor:pointer;
                border-bottom:1px solid #eee;
            ">
            ${s.name}
        </div>
    `).join("");

    dropdown.style.display =
        filtered.length ? "block" : "none";
}
        // ===== LOGO =====
        async function loadLogo() {
            try {
                const res = await fetch(API + "/admin/images/logo");
                const data = await res.json();
                document.querySelectorAll(".logoBox").forEach(box => {
                    if (data.length) {
                       box.innerHTML = `<img src="${window.location.origin}${data[0].path}" style="height:36px;object-fit:contain;">`;
                    } else {
                        box.innerHTML = `<div class="logo-icon">🏠</div> VINSUU`;
                    }
                });
            } catch {
                document.querySelectorAll(".logoBox").forEach(b => {
                    b.innerHTML = `<div class="logo-icon">🏠</div> VINSUU`;
                });
            }
        }

        // ===== SLIDER =====
        let sliderTimer = null;
        let currentSlide = 0;

        async function loadSliderImages() {
            try {
                const res = await fetch(API + "/admin/images/slide");
                const images = await res.json();
                buildSliders(images);
            } catch { buildSliders([]); }
        }

        function buildSliders(images) {
            const desktopSlider = document.getElementById("desktopSlider");
            const desktopDots = document.getElementById("desktopDots");
            const mobileBanner = document.getElementById("mobileBanner");
            const mobileDots = document.getElementById("mobileDots");

            if (!images.length) {
                if (desktopSlider) desktopSlider.innerHTML = "";
                if (desktopDots) desktopDots.innerHTML = "";
                return;
            }
            if (desktopSlider) {
                desktopSlider.innerHTML = images.map((img, i) =>
                    `<a href="${img.link || '#'}" target="_blank"><img src="${img.path}" class="${i === 0 ? 'active' : ''}"></a>`
                ).join('');
            }
            if (desktopDots) {
                desktopDots.innerHTML = images.map((_, i) =>
                    `<span class="${i === 0 ? 'active' : ''}" onclick="goSlide(${i})"></span>`
                ).join('');
            }
            if (mobileBanner) {
                mobileBanner.innerHTML = images.map((img, i) =>
                    `<img src="${img.path}" class="${i === 0 ? 'active' : ''}">`
                ).join('') + mobileBanner.innerHTML;
            }
            if (mobileDots) {
                mobileDots.innerHTML = images.map((_, i) =>
                    `<span class="${i === 0 ? 'active' : ''}" onclick="goSlide(${i})"></span>`
                ).join('');
            }
            startSliderAuto(images.length);
        }

        function startSliderAuto(total) {
            if (sliderTimer) clearInterval(sliderTimer);
            sliderTimer = setInterval(() => {
                currentSlide = (currentSlide + 1) % total;
                goSlide(currentSlide);
            }, 3500);
        }

        function goSlide(idx) {
            currentSlide = idx;
            document.querySelectorAll("#desktopSlider img").forEach((el, i) => el.classList.toggle("active", i === idx));
            document.querySelectorAll("#desktopDots span").forEach((el, i) => el.classList.toggle("active", i === idx));
            document.querySelectorAll("#mobileBanner img").forEach((el, i) => el.classList.toggle("active", i === idx));
            document.querySelectorAll("#mobileDots span").forEach((el, i) => el.classList.toggle("active", i === idx));
        }

        function prevSlide() {
            const total = document.querySelectorAll("#desktopSlider img").length || 1;
            goSlide((currentSlide - 1 + total) % total);
        }
        function nextSlide() {
            const total = document.querySelectorAll("#desktopSlider img").length || 1;
            goSlide((currentSlide + 1) % total);
        }

        // ===== WHY IMAGE =====
        async function loadWhyImage() {
            try {
                const res = await fetch(API + "/admin/images/homepage");
                const data = await res.json();
                if (data.length) document.querySelectorAll(".whyImg").forEach(el => el.src = window.location.origin + data[0].path);
            } catch { }
        }

        // ===== POPULAR SERVICES =====
        async function loadPopularServices() {
            try {
                const res = await fetch(API + "/admin/services/popular");
                const data = await res.json();

                const desktopBox = document.getElementById("popularContainer");
                const mobileBox = document.getElementById("mobilePopularContainer");

                if (!data.length) {
                    if (desktopBox) desktopBox.innerHTML = "<p style='color:var(--gray)'>No popular services found.</p>";
                    if (mobileBox) mobileBox.innerHTML = "<p style='color:var(--gray)'>No popular services found.</p>";
                    return;
                }

                const desktopHTML = data.map(s => `
                    <div class="popularCard">
                       <img src="${s.image?.startsWith("http")? s.image: window.location.origin + s.image}" alt="${s.name}">
                        <h4>${s.name}</h4>
                        <div class="rating">⭐ 4.8</div>
                        <div class="price">Starting ₹${s.price || 199}</div>
                        <button class="bookBtn" onclick="openService(${s.id})">Book Now</button>
                    </div>
                `).join('');

                const mobileHTML = data.map(s => `
                    <div class="mobilePopularItem">
                        <img src="${ s.image?.startsWith("http")? s.image: window.location.origin + s.image}" alt="${s.name}">
                        <h4>${s.name}</h4>
                        <div class="mRating">⭐ 4.8</div>
                        <div class="mPrice">₹${s.price || 199}</div>
                        <button class="mBook" onclick="openService(${s.id})">Book Now</button>
                    </div>
                `).join('');

                if (desktopBox) desktopBox.innerHTML = desktopHTML;
                if (mobileBox) mobileBox.innerHTML = mobileHTML;
            } catch (err) { console.log(err); }
        }

        function openService(id) {
    window.location.href =
        "request.html?service_id=" + id;
}

        // ===== CATEGORIES =====
        async function loadCategories() {
            try {
                const res = await fetch(API + "/admin/categories");
                const categories = await res.json();

                const desktopContainer = document.getElementById("categoryContainer");
                const mobileContainer = document.getElementById("mobileCategoryContainer");

                const desktopHTML = categories.map(cat => `
                    <div class="category-box" onclick="openCategory(${cat.id})">
                       <img src="${ cat.image?.startsWith("http")? cat.image: window.location.origin + cat.image}" alt="${cat.name}">
                        <h4>${cat.name}</h4>
                    </div>
                `).join('');

                const mobileHTML = categories.map(cat => `
                    <div class="mobileCatBox" onclick="openCategory(${cat.id})">
                      <img src="${ cat.image?.startsWith("http") ? cat.image : window.location.origin + cat.image
}" alt="${cat.name}">
                        <h4>${cat.name}</h4>
                    </div>
                `).join('');

                if (desktopContainer) desktopContainer.innerHTML = desktopHTML;
                if (mobileContainer) mobileContainer.innerHTML = mobileHTML;
            } catch (err) { console.log(err); }
        }

        function openCategory(id) { window.location = "category.html?category=" + id; }

        // ===== MENU =====
        function toggleMenu(event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById("sideMenu");
            const overlay = document.getElementById("sideOverlay");
            if (menu.classList.contains("open")) {
                closeMenu(); history.back();
            } else {
                menu.classList.add("open"); overlay.classList.add("show");
                history.pushState({ menu: true }, "");
            }
        }
        function closeMenu() {
            document.getElementById("sideMenu").classList.remove("open");
            document.getElementById("sideOverlay").classList.remove("show");
        }
        window.addEventListener("popstate", closeMenu);

        function goLogin() { window.location.href = "login.html"; }

        // ===== GPS =====
        async function useGPS() {
            if (!navigator.geolocation) return alert("GPS not supported");
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = pos.coords.latitude, lng = pos.coords.longitude;
                document.querySelectorAll(".locationResult").forEach(el => el.innerText = "📍 Fetching location...");
                try {
                    const res = await fetch(`${API}/geocode?lat=${lat}&lng=${lng}`);
                    const data = await res.json();
                    if (data.status === "OK" && data.results.length > 0) {
                        const addr = data.results[0].formatted_address;
                        document.querySelectorAll(".locationResult").forEach(el => el.innerText = "📍 " + addr);
                        saveLocation({ lat, lng, address: addr });
                        if (typeof loadNearbyStaff === "function") loadNearbyStaff(lat, lng);
                    } else {
                        document.querySelectorAll(".locationResult").forEach(el => el.innerText = `📍 Lat: ${lat}, Lng: ${lng}`);
                    }
                } catch {
                    document.querySelectorAll(".locationResult").forEach(el => el.innerText = `📍 Lat: ${lat}, Lng: ${lng}`);
                }
            }, () => alert("Location permission denied"), { enableHighAccuracy: true, timeout: 15000 });
        }

        async function saveLocation(loc) {
            try {
                await fetch(API + "/location/save", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(loc)
                });
            } catch { }
        }

        function checkGeoFence(lat, lng) {
            const allowedLat = 23.0225, allowedLng = 72.5714;
            if (getDistance(lat, lng, allowedLat, allowedLng) > 50) alert("Service not available in your area");
        }

        function getDistance(lat1, lon1, lat2, lon2) {
            const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        // ===== SEND MESSAGE =====
        async function sendMessage() {

            try {

                const name = document.getElementById("name")?.value;
                const email = document.getElementById("email")?.value;
                const mobile = document.getElementById("mobile")?.value;
                const pin = document.getElementById("pin")?.value;
                const message = document.getElementById("message")?.value;

                console.log("Sending...", name, email, message);

                if (!name || !message) {
                    alert("Fill required fields");
                    return;
                }

                const res = await fetch(API + "/admin/contact", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        mobile,
                        pin_code: pin,
                        message
                    })
                });

                const data = await res.json();

                console.log("Response:", data);

                if (data.success) {
                    alert("Message sent successfully");

                    // ✅ CLEAR FORM FIELDS
                    document.getElementById("name").value = "";
                    document.getElementById("mobile").value = "";
                    document.getElementById("email").value = "";
                    document.getElementById("pin").value = "";
                    document.getElementById("message").value = "";
                } else {
                    alert("Failed to send");
                }

            } catch (err) {
                console.log("ERROR:", err);
                alert("Server error");
            }
        }