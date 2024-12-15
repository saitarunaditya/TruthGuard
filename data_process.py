import pandas as pd

column_names = [
    "id", "label", "statement", "subject", "speaker", "job_title", 
    "state_info", "party_affiliation", "barely_true_counts", "false_counts", 
    "half_true_counts", "mostly_true_counts", "pants_on_fire_counts", "context"
]

# Load the dataset
data = pd.read_csv("/Users/saitarunaditya/Desktop/TruthGuard/liar_dataset/train.csv", header=None, names=column_names)

# Preview the dataset
print(data.head())
print(data.info())

import pandas as pd
import nltk
from nltk.tokenize import word_tokenize


# # Clean text
# data['cleaned_text'] = data['statement'].str.replace(r'\W', ' ').str.lower()

# # Tokenize
# data['tokens'] = data['cleaned_text'].apply(word_tokenize)

# # Save preprocessed data
# data.to_csv("preprocessed_data.csv", index=False)
