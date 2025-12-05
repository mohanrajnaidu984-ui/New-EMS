import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        // Attempt to load user from local storage on initial load
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            setCurrentUser(JSON.parse(storedUser));
        }
    }, []);

    const login = (userData) => {
        console.log('AuthContext: login called with', userData);
        // alert(`AuthContext: Logging in as ${userData.email}`);
        setCurrentUser(userData);
        localStorage.setItem('currentUser', JSON.stringify(userData));
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
    };

    const updateProfileImage = async (userId, base64) => {
        try {
            // Update Backend
            await fetch('http://localhost:5000/api/auth/update-profile-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, imageBase64: base64 })
            });

            // Update Local State
            if (currentUser) {
                const updatedUser = { ...currentUser, ProfileImage: base64 };
                setCurrentUser(updatedUser);
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            }
        } catch (err) {
            console.error('Failed to update profile image:', err);
        }
    };

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, updateProfileImage, isAuthenticated: !!currentUser }}>
            {children}
        </AuthContext.Provider>
    );
};
