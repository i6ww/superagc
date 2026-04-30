#!/usr/bin/env python3
import argparse
import base64
import json
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

import requests


def normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def extract_urls_from_text(text: str) -> List[str]:
    urls: List[str] = []
    markdown_urls = re.findall(r"!\[[^\]]*]\(([^)]+)\)", text or "")
    urls.extend(markdown_urls)
    urls.extend(re.findall(r"https?://[^\s'\"\)]+", text or ""))
    # de-duplicate while keeping order
    deduped = list(dict.fromkeys([u.strip() for u in urls if u and u.strip()]))
    return deduped


def parse_stream_response(response: requests.Response) -> Tuple[Optional[str], str]:
    merged_text = ""
    for raw in response.iter_lines():
        if not raw:
            continue
        line = raw.decode("utf-8", errors="ignore").strip()
        payload = line[5:].strip() if line.startswith("data:") else line
        if not payload or payload == "[DONE]":
            continue
        try:
            data = json.loads(payload)
            delta = (
                data.get("choices", [{}])[0]
                .get("delta", {})
                .get("content", "")
            )
            if isinstance(delta, str):
                merged_text += delta
            whole = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if isinstance(whole, str):
                merged_text += whole
        except Exception:
            merged_text += payload

        urls = extract_urls_from_text(merged_text)
        if urls:
            return urls[0], merged_text

    urls = extract_urls_from_text(merged_text)
    return (urls[0] if urls else None), merged_text


def parse_non_stream_response(response: requests.Response) -> Tuple[Optional[str], str]:
    data = response.json()
    text = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    text = text if isinstance(text, str) else json.dumps(data, ensure_ascii=False)
    urls = extract_urls_from_text(text)
    return (urls[0] if urls else None), text


def build_messages(prompt: str, image_path: Optional[str]) -> list:
    if not image_path:
        return [{"role": "user", "content": prompt}]

    p = Path(image_path)
    if not p.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    image_b64 = base64.b64encode(p.read_bytes()).decode("utf-8")
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ],
        }
    ]


def run_test(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    image_path: Optional[str],
    stream: bool,
    timeout: int,
) -> int:
    url = f"{normalize_base_url(base_url)}/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": build_messages(prompt, image_path), "stream": stream}

    print(f"POST {url}")
    print(f"model={model}, stream={stream}, mode={'img2img' if image_path else 'txt2img'}")
    try:
        resp = requests.post(url, headers=headers, json=body, stream=stream, timeout=timeout)
    except Exception as e:
        print(f"[ERROR] request failed: {e}")
        return 2

    print(f"status={resp.status_code}")
    if not resp.ok:
        err_text = resp.text[:2000]
        print("[ERROR] non-2xx response:")
        print(err_text)
        return 3

    try:
        image_url, debug_text = (
            parse_stream_response(resp) if stream else parse_non_stream_response(resp)
        )
    except Exception as e:
        print(f"[ERROR] parse failed: {e}")
        return 4

    if not image_url:
        print("[ERROR] no image url parsed from response")
        print("--- response preview ---")
        print(debug_text[:2000])
        return 5

    print("[OK] image url:")
    print(image_url)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="NanoBanana / chat.completions test script")
    parser.add_argument("--base-url", required=True, help="e.g. https://www.371181668.xyz")
    parser.add_argument("--api-key", required=True, help="Bearer token value")
    parser.add_argument("--model", required=True, help="e.g. nano-banana-2-1k-3:4")
    parser.add_argument("--prompt", required=True, help="Prompt text")
    parser.add_argument("--image-path", help="Optional local image path for img2img")
    parser.add_argument("--stream", action="store_true", help="Use stream=true")
    parser.add_argument("--timeout", type=int, default=600, help="Request timeout seconds")
    args = parser.parse_args()

    return run_test(
        base_url=args.base_url,
        api_key=args.api_key,
        model=args.model,
        prompt=args.prompt,
        image_path=args.image_path,
        stream=args.stream,
        timeout=args.timeout,
    )


if __name__ == "__main__":
    sys.exit(main())
