#!/usr/bin/env python3
"""Wrapper MusicGen / AudioCraft pour le Host OwnMyOwnAI."""

from __future__ import annotations

import argparse
import json
import sys


def emit(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Génère un extrait musical via MusicGen.")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="facebook/musicgen-small")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument("--duration", type=float, default=10.0)
    args = parser.parse_args()

    emit({"type": "progress", "progress": 5, "message": "Import AudioCraft…"})
    try:
        from audiocraft.models import MusicGen
        from audiocraft.data.audio import audio_write
    except ImportError as exc:
        emit(
            {
                "type": "error",
                "message": (
                    "AudioCraft n'est pas installé. "
                    "Exécutez : pip install audiocraft torch torchaudio"
                ),
                "detail": str(exc),
            }
        )
        return 1

    emit(
        {
            "type": "progress",
            "progress": 20,
            "message": f"Chargement du modèle {args.model} sur {args.device}…",
        }
    )
    try:
        model = MusicGen.get_pretrained(args.model, device=args.device)
        model.set_generation_params(duration=args.duration)
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": f"Échec chargement modèle : {exc}"})
        return 1

    emit({"type": "progress", "progress": 45, "message": "Génération audio…"})
    try:
        wav = model.generate([args.prompt])
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": f"Échec génération : {exc}"})
        return 1

    emit({"type": "progress", "progress": 85, "message": "Enregistrement WAV…"})
    try:
        audio_write(
            args.output.removesuffix(".wav"),
            wav[0].cpu(),
            model.sample_rate,
            strategy="loudness",
            loudness_compressor=True,
        )
        output_path = args.output if args.output.endswith(".wav") else f"{args.output}.wav"
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": f"Échec enregistrement : {exc}"})
        return 1

    emit(
        {
            "type": "done",
            "path": output_path,
            "sampleRate": model.sample_rate,
            "device": args.device,
            "model": args.model,
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
