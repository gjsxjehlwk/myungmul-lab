(function () {
  "use strict";

  const projects = Array.isArray(window.PROJECTS) ? window.PROJECTS : [];
  const projectList = document.querySelector("#project-list");
  const featuredList = document.querySelector("#featured-list");
  const searchInput = document.querySelector("#project-search");
  const resultCount = document.querySelector("#result-count");
  const emptyState = document.querySelector("#empty-state");
  const resetButton = document.querySelector("#reset-filters");
  const emptyResetButton = document.querySelector("#empty-reset");
  const filterButtons = Array.from(document.querySelectorAll(".filter-button"));

  const toolGroups = [
    {
      type: "수업용 도구",
      id: "classroom-tools",
      number: "A",
      description: "학생과 함께 관찰하고 질문하며 결과를 만드는 도구"
    },
    {
      type: "수업 보조 도구",
      id: "classroom-support-tools",
      number: "B",
      description: "수업의 진행과 참여를 가볍게 돕는 보조 도구"
    },
    {
      type: "업무용 도구",
      id: "work-tools",
      number: "C",
      description: "기록과 운영을 간단하게 만들어 교사의 시간을 아끼는 도구"
    }
  ];

  let activeType = "전체";

  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, " ")
      .trim();

  const escapeHTML = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function cardTemplate(project, featured = false) {
    const tags = project.tags
      .map((tag) => `<li>${escapeHTML(tag)}</li>`)
      .join("");
    const notice = project.notice
      ? `<p class="card-notice"><span aria-hidden="true">!</span>${escapeHTML(project.notice)}</p>`
      : "";

    return `
      <article class="project-card${featured ? " featured-card" : ""}">
        <a class="thumbnail-link" href="${escapeHTML(project.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(project.title)} 새 탭에서 열기">
          <img src="${escapeHTML(project.thumbnail)}" alt="${escapeHTML(project.title)} 사이트 화면" loading="${featured ? "eager" : "lazy"}" />
          <span class="status-badge"><i aria-hidden="true"></i>운영 중</span>
        </a>
        <div class="card-body">
          <p class="card-category">${escapeHTML(project.type)} · ${escapeHTML(project.category)}</p>
          <h3>${escapeHTML(project.title)}</h3>
          <p class="card-description">${escapeHTML(project.description)}</p>
          ${notice}
          <ul class="tag-list" aria-label="태그">${tags}</ul>
          <a class="card-link" href="${escapeHTML(project.url)}" target="_blank" rel="noopener noreferrer">
            프로젝트 열기 <span aria-hidden="true">↗</span>
          </a>
        </div>
      </article>`;
  }

  function renderFeatured() {
    featuredList.innerHTML = projects
      .filter((project) => project.featured)
      .map((project) => cardTemplate(project, true))
      .join("");
  }

  function updateFilterButtons() {
    filterButtons.forEach((button) => {
      const selected = button.dataset.type === activeType;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderProjects() {
    const query = normalize(searchInput.value);
    const filtered = projects.filter((project) => {
      const typeMatches = activeType === "전체" || project.type === activeType;
      const searchableText = normalize([
        project.title,
        project.description,
        project.type,
        project.category,
        ...project.tags
      ].join(" "));
      return typeMatches && (!query || searchableText.includes(query));
    });

    projectList.innerHTML = toolGroups
      .map((group) => {
        const items = filtered.filter((project) => project.type === group.type);
        if (!items.length) return "";
        return `
          <section class="tool-group" id="${group.id}" aria-labelledby="${group.id}-title">
            <div class="tool-group-heading">
              <div class="tool-group-title">
                <span class="tool-group-number" aria-hidden="true">${group.number}</span>
                <div>
                  <h3 id="${group.id}-title">${escapeHTML(group.type)}</h3>
                  <p>${escapeHTML(group.description)}</p>
                </div>
              </div>
              <strong>${items.length}개</strong>
            </div>
            <div class="project-grid">${items.map((project) => cardTemplate(project)).join("")}</div>
          </section>`;
      })
      .join("");
    projectList.hidden = filtered.length === 0;
    emptyState.hidden = filtered.length !== 0;
    resultCount.textContent = `전체 ${projects.length}개 중 ${filtered.length}개의 도구`;
  }

  function resetFilters() {
    activeType = "전체";
    searchInput.value = "";
    updateFilterButtons();
    renderProjects();
    searchInput.focus();
  }

  searchInput.addEventListener("input", renderProjects);
  resetButton.addEventListener("click", resetFilters);
  emptyResetButton.addEventListener("click", resetFilters);

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeType = button.dataset.type;
      updateFilterButtons();
      renderProjects();
    });
  });

  renderFeatured();
  updateFilterButtons();
  renderProjects();
})();
