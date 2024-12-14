FROM ubuntu:20.04

# Install Node.js and Yarn
RUN apt-get update && \
    apt-get install -y curl git && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn && \
    apt-get clean

# Create a non-root user
RUN useradd -m -s /bin/bash node
USER node

# Clone the repository
RUN git clone https://github.com/Toxic1239/Queen-RiasV3.git /home/node/blue

# Set the working directory
WORKDIR /home/node/blue

# Set permissions and install dependencies
RUN chmod -R 777 /home/node/blue && \
    yarn install && \
    yarn add http

# Copy server.js and start.sh scripts
COPY server.js .
COPY start.sh .

# Start the application
CMD ["bash", "start.sh"]