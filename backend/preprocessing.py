from PIL import Image
from torchvision import transforms


MODEL_INPUT_SIZE = 224


def preprocess_image(image: Image.Image):
    transform = transforms.Compose(
        [
            transforms.Resize((MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )
    return transform(image.convert("RGB")).unsqueeze(0)
