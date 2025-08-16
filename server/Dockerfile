# Use Node.js official image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the source code
COPY . .

# Copy .env file (optional, but usually passed via docker-compose or -e flags instead)
# COPY .env .env

# Expose app port (change if not 3000)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
