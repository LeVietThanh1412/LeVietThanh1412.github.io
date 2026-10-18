(() => {
  "use strict";
  const toggle = document.querySelector(".menu-toggle");
  const navigation = document.getElementById("navigation");
  const closeMenu = () => {
    navigation.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Mở menu");
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
    navigation.classList.toggle("open", open);
  });
  navigation.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeMenu();
      toggle.focus();
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".navbar")) closeMenu();
  });
  window.matchMedia("(min-width: 761px)").addEventListener("change", event => {
    if (event.matches) closeMenu();
  });
  const rows = [...document.querySelectorAll(".project-row")];
  const filters = [...document.querySelectorAll(".filter")];
  const search = document.getElementById("project-search");
  const showMore = document.getElementById("show-more");
  const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const searchable = new Map(rows.map(row => [row, normalize(row.dataset.search)]));
  let category = "all";
  let limit = 8;
  const filterProjects = () => {
    const query = normalize(search.value.trim());
    let count = 0;
    let shown = 0;
    for (const row of rows) {
      const matchesCategory = category === "all" || (category === "live" ? row.dataset.live === "true" : row.dataset.category === category);
      const matches = matchesCategory && searchable.get(row).includes(query);
      if (matches) count += 1;
      const visible = matches && count <= limit;
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    document.getElementById("empty-state").hidden = count !== 0;
    document.getElementById("result-count").textContent = `${shown} / ${count} dự án${query || category !== "all" ? " phù hợp" : ""}`;
    showMore.hidden = shown >= count;
    showMore.innerHTML = `Xem thêm dự án (${count - shown}) <span aria-hidden="true">↓</span>`;
  };
  filters.forEach(button => button.addEventListener("click", () => {
    category = button.dataset.filter;
    limit = 8;
    filters.forEach(filter => {
      const active = filter === button;
      filter.classList.toggle("active", active);
      filter.setAttribute("aria-pressed", String(active));
    });
    filterProjects();
  }));
  search.addEventListener("input", () => {
    limit = 8;
    filterProjects();
  });
  showMore.addEventListener("click", () => {
    limit += 8;
    filterProjects();
  });
  document.getElementById("project-total").textContent = rows.length;
  document.getElementById("project-tools").hidden = false;
  document.getElementById("year").textContent = new Date().getFullYear();
  filterProjects();
})();
