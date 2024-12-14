from datasets import load_dataset

# Load the dataset
dataset = load_dataset("liar.py", split="train")

# Inspect the dataset
print(dataset.num_rows)  # Print the first data sample

