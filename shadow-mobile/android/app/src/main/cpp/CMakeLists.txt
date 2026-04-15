cmake_minimum_required(VERSION 3.22.1)

project("mnnbridge")

add_library(${CMAKE_PROJECT_NAME} SHARED
    mnn_bridge.cpp
)

# Link Android and C++ libraries
target_link_libraries(${CMAKE_PROJECT_NAME}
    android
    log
    c++_shared
)
