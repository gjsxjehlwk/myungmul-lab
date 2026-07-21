# 명물쌤의 탐구실

과학·물리 교사가 직접 만든 수업과 생활 도구를 한곳에 모은 정적 프로젝트 허브입니다.

## 프로젝트 추가

`projects.js`의 `window.PROJECTS` 배열에 아래 필드를 가진 항목을 추가합니다.

- `id`, `title`, `description`, `category`, `url`
- `tags`, `featured`, `thumbnail`, `notice`

썸네일은 16:9 WebP 파일을 `assets/thumbnails/`에 저장합니다.

## 로컬 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.
