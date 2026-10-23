"""
Model Loader Service
Loads the pre-trained BLIP Vision-Language model from HuggingFace.
The model is loaded once at startup and reused for all inference requests.
No training or GPU required — works on CPU out of the box.
"""

import logging
import asyncio
from typing import Optional

import torch
from transformers import BlipProcessor, BlipForConditionalGeneration
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class MedicalImageModel:
    """
    Wrapper around the pre-trained BLIP model for medical image captioning.

    BLIP (Bootstrapping Language-Image Pre-training) is a vision-language model
    that can generate text descriptions from images. While not specifically trained
    on medical data, it provides strong baseline performance for image description
    and can be prompted to generate medical-style reports.
    """

    def __init__(self):
        self.processor: Optional[BlipProcessor] = None
        self.model: Optional[BlipForConditionalGeneration] = None
        self.device: str = settings.DEVICE
        self.model_name: str = settings.MODEL_NAME
        self._is_loaded: bool = False
        self._loading_lock = asyncio.Lock()

    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded and ready."""
        return self._is_loaded

    async def load_model(self) -> None:
        """
        Load the BLIP model and processor from HuggingFace.
        Downloads automatically on first run (~1.5GB) in a background thread.
        """
        if self._is_loaded:
            return

        async with self._loading_lock:
            if self._is_loaded:
                return

            try:
                logger.info(f"Loading model: {self.model_name} on {self.device}...")

                def _sync_load():
                    processor = BlipProcessor.from_pretrained(self.model_name)
                    model = BlipForConditionalGeneration.from_pretrained(
                        self.model_name,
                        torch_dtype=torch.float32,
                    ).to(self.device)
                    model.eval()
                    return processor, model

                self.processor, self.model = await asyncio.to_thread(_sync_load)
                self._is_loaded = True
                logger.info("Model loaded successfully!")
            except Exception as e:
                logger.warning(f"Could not load HuggingFace BLIP weights ({e}). Clinical inference engine active.")
                self._is_loaded = False

    def generate_caption(
        self,
        image: Image.Image,
        prompt: str = "a detailed medical report of this radiograph showing",
        max_length: int = 200,
        num_beams: int = 4,
    ) -> tuple[str, float]:
        """
        Generate a text description/caption from a medical image.

        Args:
            image: PIL Image (RGB).
            prompt: Conditional text prompt to guide generation toward medical language.
            max_length: Maximum number of tokens to generate.
            num_beams: Beam search width (higher = better quality, slower).

        Returns:
            Tuple of (generated_text, confidence_score).
            Confidence is derived from the model's sequence log-probability.
        """
        if not self._is_loaded:
            raise RuntimeError("Model is not loaded. Call load_model() first.")

        # Process image + prompt
        inputs = self.processor(
            images=image,
            text=prompt,
            return_tensors="pt",
        ).to(self.device)

        # Generate text with scores for confidence estimation
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_length=max_length,
                num_beams=num_beams,
                early_stopping=True,
                repetition_penalty=1.2,
                output_scores=True,
                return_dict_in_generate=True,
            )

        # Decode tokens to text
        generated_text = self.processor.decode(
            outputs.sequences[0], skip_special_tokens=True
        )

        # Compute confidence from sequence scores
        confidence = self._compute_confidence(outputs)

        return generated_text, confidence

    def _compute_confidence(self, outputs) -> float:
        """
        Compute a confidence score from the model's generation output.
        Uses the average token-level probability as a proxy for confidence.
        Falls back to a fixed score if scores aren't available.
        """
        try:
            if hasattr(outputs, "sequences_scores") and outputs.sequences_scores is not None:
                # sequences_scores is the log-prob of the whole sequence
                log_prob = outputs.sequences_scores[0].item()
                # Convert log-prob to a 0-1 range (sigmoid-like mapping)
                import math
                confidence = 1.0 / (1.0 + math.exp(-log_prob / 5.0))
                return round(max(0.1, min(0.99, confidence)), 2)
            elif hasattr(outputs, "scores") and outputs.scores:
                # Compute average token probability from per-step scores
                probs = []
                for step_scores in outputs.scores:
                    step_probs = torch.softmax(step_scores[0], dim=-1)
                    max_prob = step_probs.max().item()
                    probs.append(max_prob)
                if probs:
                    avg_prob = sum(probs) / len(probs)
                    return round(max(0.1, min(0.99, avg_prob)), 2)
        except Exception as e:
            logger.warning(f"Could not compute confidence score: {e}")

        return 0.75  # Reasonable default fallback

    def generate_multiple_descriptions(
        self, image: Image.Image
    ) -> dict[str, object]:
        """
        Generate multiple descriptions using different prompts to create
        a structured medical report with findings and impressions.

        Returns:
            Dict with 'findings', 'impression', 'full_report', and 'confidence_score' keys.
        """
        confidence_scores = []

        # Generate findings (detailed observations)
        findings_prompts = [
            "a detailed medical report of this chest radiograph showing",
            "the medical findings in this x-ray image include",
        ]

        findings_parts = []
        for prompt in findings_prompts:
            text, conf = self.generate_caption(image, prompt=prompt, max_length=150)
            findings_parts.append(text)
            confidence_scores.append(conf)

        # Generate impression (summary/conclusion)
        impression, imp_conf = self.generate_caption(
            image,
            prompt="the clinical impression of this medical image is",
            max_length=100,
            num_beams=3,
        )
        confidence_scores.append(imp_conf)

        # Combine and structure
        findings = ". ".join(findings_parts)
        full_report = (
            f"FINDINGS:\n{findings}\n\n"
            f"IMPRESSION:\n{impression}"
        )

        # Overall confidence is the average across all generations
        overall_confidence = round(
            sum(confidence_scores) / len(confidence_scores), 2
        ) if confidence_scores else 0.75

        return {
            "findings": findings,
            "impression": impression,
            "full_report": full_report,
            "confidence_score": overall_confidence,
        }


# Singleton instance — shared across the entire application
medical_model = MedicalImageModel()
