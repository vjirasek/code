import os
import requests
import re
import html  # Import html module for decoding HTML entities

# Define the base URL
base_url = "https://www.grc.com/sn/sn-"

# Starting episode if no history is present
DEFAULT_START_EPISODE = 596

# URL to check the latest available episode
episodes_page_url = "https://www.grc.com/securitynow.htm"

# Function to get the latest episode number dynamically
def get_latest_episode_number():
    try:
        response = requests.get(episodes_page_url)
        if response.status_code == 200:
            # Decode HTML entities in the page content
            decoded_page = html.unescape(response.text)

            # Search for the "Episode #" pattern followed by digits (including spaces like &nbsp;)
            episode_numbers = re.findall(r"Episode\s*#(\d+)", decoded_page)
            if episode_numbers:
                # Return the largest episode number found
                print("Latest eisode:",max(map(int, episode_numbers)))
                return max(map(int, episode_numbers))
            else:
                print("Error: No episode numbers found.")
                return None
        else:
            print(f"Failed to fetch the page, status code: {response.status_code}")
            return None
    except Exception as e:
        print(f"Error fetching the page: {e}")
        return None

def load_last_episode(path):
    try:
        with open(path, "r", encoding="utf-8") as tracker:
            return int(tracker.read().strip())
    except (FileNotFoundError, ValueError):
        return None


def save_last_episode(path, episode_number):
    try:
        with open(path, "w", encoding="utf-8") as tracker:
            tracker.write(str(episode_number))
    except OSError as error:
        print(f"Warning: could not record last episode ({error}).")


# Function to download a single PDF
def download_pdf(pdf_url, file_name):
    if os.path.exists(file_name):  # Check if the file already exists
        print(f"File already exists, skipping: {file_name}")
        return True  # Treat existing files as a successful download

    try:
        # Send GET request to download the PDF
        response = requests.get(pdf_url, stream=True)

        if response.status_code == 200:
            # Open the file in binary write mode and save the content
            with open(file_name, 'wb') as pdf_file:
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        pdf_file.write(chunk)
            print(f"Downloaded: {file_name}")
            return True
        else:
            print(f"Failed to download {file_name}: Status code {response.status_code}")
            return False
    except Exception as e:
        print(f"Error downloading {file_name}: {e}")
        return False

# Get the latest episode number dynamically
end_number = get_latest_episode_number()

if end_number:
    # Get the current working directory (where the script is located)
    current_directory = os.getcwd()
    tracker_path = os.path.join(current_directory, "last_downloaded_episode.txt")

    last_downloaded_episode = load_last_episode(tracker_path)
    if last_downloaded_episode is not None:
        start_number = max(last_downloaded_episode + 1, DEFAULT_START_EPISODE)
    else:
        start_number = DEFAULT_START_EPISODE

    if start_number > end_number:
        print("No new episodes to download. You're up to date!")
    else:
        print(f"Starting download from episode {start_number} to episode {end_number}...")

        # Download PDFs from the specified range
        for number in range(start_number, end_number + 1):
            file_name = os.path.join(current_directory, f"sn-{number}-notes.pdf")  # File name with formatted number
            pdf_url = f"{base_url}{number}-notes.pdf"  # URL for the PDF
            if download_pdf(pdf_url, file_name):  # Download the PDF
                save_last_episode(tracker_path, number)

        print("Download complete.")
else:
    print("Failed to retrieve the latest episode number.")
