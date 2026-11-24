FROM node:20-alpine AS editor-builder

WORKDIR /build
COPY packages/student-renderer/ /build/packages/student-renderer/
WORKDIR /build/src/modu_math_web/editor_next
COPY src/modu_math_web/editor_next/package.json src/modu_math_web/editor_next/package-lock.json ./
RUN npm ci
COPY src/modu_math_web/editor_next/ ./
RUN npm run build

FROM node:20-alpine AS student-builder

ARG VITE_API_BASE_URL=same-origin
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /build
COPY packages/student-renderer/ /build/packages/student-renderer/
WORKDIR /build/apps/mobile
COPY apps/mobile/package.json apps/mobile/package-lock.json ./
RUN npm ci
COPY apps/mobile/index.html apps/mobile/tsconfig.json apps/mobile/vite.config.ts apps/mobile/capacitor.config.ts ./
COPY apps/mobile/src ./src
RUN npm run build


FROM scratch AS student_bundle
COPY --from=student-builder /build/apps/mobile/dist/ /usr/share/nginx/html/


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app
COPY . /app
COPY --from=editor-builder /build/src/modu_math_web/editor_next/static/editor_next/konva_assets/ /app/src/modu_math_web/editor_next/static/editor_next/konva_assets/
COPY --from=student_bundle /usr/share/nginx/html/ /app/student-static/editor_next/student_app/
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["gunicorn", "modu_math_web.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
